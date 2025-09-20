from __future__ import annotations

import json
import logging
import os
import re
import traceback
from datetime import datetime
from typing import Any

import base64

from dotenv import load_dotenv
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from uuid import uuid4
import mimetypes
import base64



import google.genai as genai
from google.genai import types

from io import BytesIO
from PIL import Image

API_PREFIX = "/api/v1"
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
LOCATION = os.getenv("GCP_LOCATION", "us-central1")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
ENABLE_LIVE = os.getenv("ENABLE_LIVE_SERVICES", "false").lower() == "true"
MAX_GEMINI_ATTEMPTS = 3

app = FastAPI(title="Trip Planner API", version="0.1.0")

# Import and include weather router
try:
    from .weather import router as weather_router
except ImportError:
    from weather import router as weather_router
app.include_router(weather_router)

# Import and include city images router
try:
    from .city_images import router as city_images_router
except ImportError:
    from city_images import router as city_images_router
app.include_router(city_images_router)

# Import and include AI image generation router
try:
    from .ai_image_generation import router as ai_image_router
except ImportError:
    from ai_image_generation import router as ai_image_router
app.include_router(ai_image_router)

# Import and include smart tips router
try:
    from .smart_tips import router as smart_tips_router
except ImportError:
    from smart_tips import router as smart_tips_router
app.include_router(smart_tips_router)

# Import and include translate router
try:
    from .translate import router as translate_router
except ImportError:
    from translate import router as translate_router
app.include_router(translate_router)

# Import and include geocode router
try:
    from .geocode import router as geocode_router
except ImportError:
    from geocode import router as geocode_router
app.include_router(geocode_router)

# Import and include weather summary router
try:
    from .weather_summary import router as weather_summary_router
except ImportError:
    from weather_summary import router as weather_summary_router
app.include_router(weather_summary_router)

# Import and include directions router
try:
    from .directions import router as directions_router
except ImportError:
    from directions import router as directions_router
app.include_router(directions_router)

STATIC_DIR = Path("static")
GEN_DIR = STATIC_DIR / "generated"
GEN_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


_cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _cors_origins if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

class TripPreferences(BaseModel):
    origin: str
    destination: str
    startDate: str
    endDate: str
    budget: int = Field(ge=1000, le=500000)
    themes: list[str]
    travellers: int = Field(ge=1, le=6)
    language: str = "English"
    enableLiveData: bool = True

    @field_validator("themes")
    @classmethod
    def ensure_themes(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("Select at least one theme")
        return value

class ItineraryRequest(BaseModel):
    preferences: TripPreferences

class ImageGenerationRequest(BaseModel):
    prompt: str

def _client() -> genai.Client:
    return genai.Client(vertexai=True, project=PROJECT_ID, location=GCP_GLOBAL_LOCATION)

def _first_image_bytes(response) -> bytes | None:
    if not getattr(response, "candidates", None):
        return None
    for part in getattr(response.candidates[0].content, "parts", []):
        inline = getattr(part, "inline_data", None)
        if inline and getattr(inline, "data", None):
            return inline.data
    return None

def _to_jpeg_data_url(image_bytes: bytes) -> tuple[str, bytes]:
    img = Image.open(BytesIO(image_bytes))
    img = img.convert("RGB")
    img = img.resize((1024, 1024)) if max(img.size) > 1024 else img
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    jpeg_bytes = buf.getvalue()
    b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}", jpeg_bytes

def build_base_payload(prefs: TripPreferences) -> dict[str, Any]:
    return {
        "createdAt": datetime.utcnow().isoformat(),
        "destination": f"{prefs.destination}, India",
        "budget": prefs.budget,
        "currency": "INR",
        "totalEstimatedCost": int(prefs.budget * 0.9),
        "days": [],
        "costBreakdown": [],
    }

def build_prompt(prefs: TripPreferences) -> str:
    themes = ", ".join(prefs.themes)
    return (
        "You are an Indian travel concierge creating detailed itineraries for real travellers.\n"
        "Return ONLY a JSON object that matches this schema: {\n"
        "  \"totalEstimatedCost\": number,\n"
        "  \"weatherAdvisory\": string,\n"
        "  \"costBreakdown\": [ { \"category\": string, \"amount\": number, \"notes\": string? } ],\n"
        "  \"days\": [ {\n"
        "      \"dateLabel\": string,\n"
        "      \"summary\": string,\n"
        "      \"activities\": [ {\n"
        "          \"time\": string,\n"
        "          \"title\": string,\n"
        "          \"description\": string,\n"
        "          \"cost\": number,\n"
        "          \"location\": string,\n"
        "          \"source\": string\n"
        "      } ],\n"
        "      \"accommodation\": { \"name\": string, \"cost\": number, \"notes\": string }?\n"
        "  } ]\n"
        "}.\n"
        f"Trip requirements: plan a trip in {prefs.destination}, India for {prefs.travellers} travellers.\n"
        f"Travel window: {prefs.startDate} to {prefs.endDate}.\n"
        f"Total budget: {prefs.budget} INR.\n"
        f"Focus themes: {themes or 'General discovery'}.\n"
        f"All activities, accommodations, and locations must be within {prefs.destination} or its immediate neighbourhoods. Do not mention any other city.\n"
        f"Ensure every activity.location explicitly includes {prefs.destination} or a recognised neighbourhood of {prefs.destination}.\n"
        "If you cannot comply, return {\"error\": \"destination_mismatch\"} and nothing else.\n"
        "Respond with STRICT JSON only, no backticks or commentary.\n"
        "Mark each activity \"source\" as \"places-api\" when it references a real POI or \"ai\" otherwise.\n"
        f"Return text in {prefs.language or 'English'} when describing activities.\n"
    )

def extract_json_object(raw_text: str) -> str:
    if not raw_text:
        raise ValueError("Empty response from model")
    text = raw_text.strip()
    try:
        if text.startswith('```'):
            text = re.sub(r'^```(?:json)?', '', text, flags=re.IGNORECASE).strip()
            text = re.sub(r'```$', '', text).strip()
        start = text.find('{')
        if start == -1:
            raise ValueError("No JSON object found in response")
        depth = 0
        in_string = False
        escape = False
        for index in range(start, len(text)):
            char = text[index]
            if char == '"' and not escape:
                in_string = not in_string
            if in_string and char == '\\' and not escape:
                escape = True
                continue
            escape = False
            if in_string:
                continue
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    return text[start:index + 1]
        raise ValueError("Incomplete JSON object in response")
    except Exception:
        traceback.print_exc()
        raise

@app.get(f"{API_PREFIX}/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

def _text_and_first_image_from_stream(stream) -> tuple[str, bytes | None]:
    """
    Returns (combined_text, first_image_bytes_or_None)
    """
    texts = []
    img_bytes = None
    for chunk in stream:
        if getattr(chunk, "text", None):
            texts.append(chunk.text)
        if getattr(chunk, "candidates", None):
            for part in getattr(chunk.candidates[0].content, "parts", []):
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None) and img_bytes is None:
                    img_bytes = inline.data
    return ("".join(texts), img_bytes)


@app.post(f"{API_PREFIX}/itinerary")
def generate_live_itinerary(request: ItineraryRequest = Body(...)):
    prefs = request.preferences
    itinerary = None
    meta = {}
    try:
        client = _client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=build_prompt(prefs))])],
            config=types.GenerateContentConfig(
                temperature=0.7,
                top_p=0.9,
                max_output_tokens=8192,
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                ],
            ),
        )
        raw_text = getattr(response, "text", None)
        if not raw_text and getattr(response, "candidates", None):
            raw_chunks = []
            for candidate in response.candidates:
                for part in getattr(candidate.content, "parts", []):
                    if hasattr(part, "text") and part.text:
                        raw_chunks.append(part.text)
            raw_text = "".join(raw_chunks)
        if not raw_text:
            raise ValueError("Gemini returned an empty response")
        cleaned_text = extract_json_object(raw_text)
        if cleaned_text is None:
            raise ValueError("Gemini response did not contain JSON")
        itinerary = json.loads(cleaned_text)
        # Ensure destination and budget are always present
        itinerary["destination"] = f"{prefs.destination}, India"
        itinerary["budget"] = prefs.budget
        itinerary["currency"] = "INR"
        itinerary["createdAt"] = datetime.utcnow().isoformat()
        meta = {"source": "gemini"}
    except Exception as exc:
        logger.error("Gemini itinerary generation failed: %s", exc, exc_info=True)
        itinerary = build_base_payload(prefs)
        meta = {"source": "template", "error": str(exc)}

    # Add static city images to the itinerary
    try:
        from .city_images import CITY_IMAGES
        itinerary["image_urls"] = CITY_IMAGES.get(prefs.destination, [])
    except Exception as e:
        logger.error(f"Failed to get city images: {e}")

    itinerary["meta"] = meta
    return JSONResponse(itinerary)
