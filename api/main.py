from __future__ import annotations
import json
import logging
import os
import re
import traceback
from datetime import datetime, date
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
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
ENABLE_LIVE = os.getenv("ENABLE_LIVE_SERVICES", "false").lower() == "true"
MAX_GEMINI_ATTEMPTS = 3

app = FastAPI(title="Trip Planner API", version="0.1.0")

try:
    from .weather import router as weather_router
except ImportError:
    from weather import router as weather_router
app.include_router(weather_router)

try:
    from .city_images import router as city_images_router
except ImportError:
    from city_images import router as city_images_router
app.include_router(city_images_router)

try:
    from .ai_image_generation import router as ai_image_router
except ImportError:
    from ai_image_generation import router as ai_image_router
app.include_router(ai_image_router)

try:
    from .smart_tips import router as smart_tips_router
except ImportError:
    from smart_tips import router as smart_tips_router
app.include_router(smart_tips_router)

try:
    from .translate import router as translate_router
except ImportError:
    from translate import router as translate_router
app.include_router(translate_router)

try:
    from .geocode import router as geocode_router
except ImportError:
    from geocode import router as geocode_router
app.include_router(geocode_router)

try:
    from .weather_summary import router as weather_summary_router
except ImportError:
    from weather_summary import router as weather_summary_router
app.include_router(weather_summary_router)

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

def _days_between_inclusive(a: str, b: str) -> int:
    sa = date.fromisoformat(a)
    sb = date.fromisoformat(b)
    d = (sb - sa).days + 1
    return max(1, d)

def _system_instruction(prefs: TripPreferences, day_count: int) -> str:
    t = ", ".join(prefs.themes)
    return (
        "Write terse JSON in English. Keep all strings short. "
        "summary ≤ 32 words. title ≤ 10 words. description ≤ 32 words. "
        "Use 24h times like 09:00. Costs are integers. "
        f"Destination is {prefs.destination}, India only. "
        "Mark source as \"places-api\" for real POIs, else \"ai\". "
        f"Create exactly {day_count} days with 3–4 activities each."
    )

def _response_schema(day_count: int) -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "totalEstimatedCost": {"type": "NUMBER"},
            "weatherAdvisory": {"type": "STRING"},
            "costBreakdown": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "category": {"type": "STRING"},
                        "amount": {"type": "NUMBER"},
                        "notes": {"type": "STRING", "nullable": True},
                    },
                    "required": ["category", "amount"],
                },
                "maxItems": 5,
            },
            "days": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "dateLabel": {"type": "STRING"},
                        "summary": {"type": "STRING"},
                        "activities": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "time": {"type": "STRING", "format": "time"},
                                    "title": {"type": "STRING"},
                                    "description": {"type": "STRING"},
                                    "cost": {"type": "NUMBER"},
                                    "location": {"type": "STRING"},
                                    "source": {"type": "STRING", "enum": ["places-api", "ai"]},
                                },
                                "required": ["time", "title", "description", "cost", "location", "source"],
                            },
                            "minItems": 3,
                            "maxItems": 4,
                        },
                        "accommodation": {
                            "type": "OBJECT",
                            "nullable": True,
                            "properties": {
                                "name": {"type": "STRING"},
                                "cost": {"type": "NUMBER"},
                                "notes": {"type": "STRING"},
                            },
                            "required": ["name", "cost"],
                        },
                    },
                    "required": ["dateLabel", "summary", "activities"],
                },
                "minItems": day_count,
                "maxItems": day_count,
            },
        },
        "required": ["totalEstimatedCost", "weatherAdvisory", "costBreakdown", "days"],
        "propertyOrdering": ["totalEstimatedCost", "weatherAdvisory", "costBreakdown", "days"],
    }

def build_prompt(prefs: TripPreferences, day_count: int) -> str:
    t = ", ".join(prefs.themes)
    return (
        f"Trip in {prefs.destination}, India for {prefs.travellers} travellers. "
        f"Dates {prefs.startDate} to {prefs.endDate}. "
        f"Budget {prefs.budget} INR. "
        f"Themes {t or 'General'}. "
        f"Language {prefs.language or 'English'}."
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
        day_count = _days_between_inclusive(prefs.startDate, prefs.endDate)
        client = _client()
        sys_instruction = _system_instruction(prefs, day_count)
        resp_schema = _response_schema(day_count)
        token_cap = 8192
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=build_prompt(prefs, day_count))])],
            config=types.GenerateContentConfig(
                system_instruction=sys_instruction,
                temperature=0.4,
                top_p=0.8,
                max_output_tokens=token_cap,
                response_mime_type="application/json",
                response_schema=resp_schema,
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
        try:
            itinerary = json.loads(raw_text)
        except Exception:
            cleaned_text = extract_json_object(raw_text)
            if cleaned_text is None:
                raise ValueError("Gemini response did not contain JSON")
            itinerary = json.loads(cleaned_text)
        itinerary["destination"] = f"{prefs.destination}, India"
        itinerary["budget"] = prefs.budget
        itinerary["currency"] = "INR"
        itinerary["createdAt"] = datetime.utcnow().isoformat()
        meta = {"source": "gemini", "mode": "structured"}
    except Exception as exc:
        logger.error("Gemini itinerary generation failed: %s", exc, exc_info=True)
        itinerary = build_base_payload(prefs)
        meta = {"source": "template", "error": str(exc)}
    try:
        from .city_images import CITY_IMAGES
        itinerary["image_urls"] = CITY_IMAGES.get(prefs.destination, [])
    except Exception as e:
        logger.error(f"Failed to get city images: {e}")
    itinerary["meta"] = meta
    return JSONResponse(itinerary)
