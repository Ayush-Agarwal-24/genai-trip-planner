import os
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
import google.genai as genai
from google.genai import types
import json

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")

router = APIRouter()

def _client() -> genai.Client:
    return genai.Client(vertexai=True, project=PROJECT_ID, location=GCP_GLOBAL_LOCATION)

@router.post("/api/v1/weather-summary")
def get_weather_summary(
    weather_data: dict = Body(...)
):
    try:
        client = _client()
        
        weather_str = json.dumps(weather_data, indent=2)
        
        prompt = f"Based on the following weather data, provide a concise, conversational summary for a traveler. Mention the overall trend, any significant weather events (like rain), and what to pack.\n\n{weather_str}"
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                temperature=0.7,
                top_p=0.9,
                max_output_tokens=512,
            ),
        )
        
        summary = getattr(response, "text", "Could not generate a weather summary.")
        
        return JSONResponse({"summary": summary})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
