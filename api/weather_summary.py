import os
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
import os, json, time, random
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

import google.genai as genai
from google.genai import types

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")

load_dotenv()

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", os.getenv("GCP_PROJECT_ID", ""))
os.environ.setdefault(
    "GOOGLE_CLOUD_LOCATION",
    os.getenv("GCP_GLOBAL_LOCATION") or os.getenv("GCP_LOCATION") or "global",
)
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

router = APIRouter()

@router.post("/api/v1/weather-summary")
def get_weather_summary(
    weather_data: dict = Body(...)
):
    try:        
        weather_str = json.dumps(weather_data, indent=2)
        
        prompt = f"Based on the following weather data, provide a concise, conversational summary for a traveler. Mention the overall trend, any significant weather events (like rain), and what to pack.\n\n{weather_str}"
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                temperature=0.7,
                top_p=0.9,
                max_output_tokens=512,
            ),
        )
        
        summary = getattr(response, "text", "Could not generate a weather summary.")
        
        return JSONResponse({"summary": summary})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
