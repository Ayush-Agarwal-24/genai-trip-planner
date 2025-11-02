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

@router.get("/api/v1/smart-tips")
def get_smart_tips(
    destination: str = Query(..., description="Destination city"),
    themes: str = Query("", description="Comma-separated list of themes")
):
    try:
        prompt = f"Provide 3-4 concise, actionable travel tips for a trip to {destination}, focusing on the themes of {themes}. For example, mention specific local foods to try, cultural etiquette, or hidden gems. Return the tips as a JSON array of strings."
        
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                temperature=0.7,
                top_p=0.9,
                max_output_tokens=512,
            ),
        )
        
        tips_text = getattr(response, "text", "[]")
        tips_text = tips_text.strip().replace("```json", "").replace("```", "").strip()
        
        import json
        tips = json.loads(tips_text)
        
        return JSONResponse({"destination": destination, "themes": themes, "tips": tips})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
