import os
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
import google.genai as genai
from google.genai import types
import json
from dotenv import load_dotenv

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
@router.post("/api/v1/translate-itinerary")
def translate_itinerary(
    itinerary: dict = Body(...),
    target_language: str = Body(...)
):
    try:
        
        itinerary_str = json.dumps(itinerary, indent=2)
        
        prompt = f"Translate the user-facing string values in the following JSON object to {target_language}. Keep the JSON structure and all keys identical. Only translate the values of keys like 'summary', 'description', 'title', 'notes', 'weatherAdvisory', etc. Do not translate keys or technical values.\n\n{itinerary_str}"
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                temperature=0.2,
                top_p=0.9,
                max_output_tokens=4096,
            ),
        )
        
        translated_text = getattr(response, "text", "{}")
        translated_text = translated_text.strip().replace("```json", "").replace("```", "").strip()
        
        translated_itinerary = json.loads(translated_text)
        
        return JSONResponse(translated_itinerary)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
