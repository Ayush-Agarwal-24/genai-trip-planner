import os
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import google.genai as genai
from google.genai import types

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")

router = APIRouter()

def _client() -> genai.Client:
    return genai.Client(vertexai=True, project=PROJECT_ID, location=GCP_GLOBAL_LOCATION)

@router.get("/api/v1/smart-tips")
def get_smart_tips(
    destination: str = Query(..., description="Destination city"),
    themes: str = Query("", description="Comma-separated list of themes")
):
    try:
        client = _client()
        prompt = f"Provide 3-4 concise, actionable travel tips for a trip to {destination}, focusing on the themes of {themes}. For example, mention specific local foods to try, cultural etiquette, or hidden gems. Return the tips as a JSON array of strings."
        
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                temperature=0.7,
                top_p=0.9,
                max_output_tokens=512,
            ),
        )
        
        tips_text = getattr(response, "text", "[]")
        # Clean up the response to be valid JSON
        tips_text = tips_text.strip().replace("```json", "").replace("```", "").strip()
        
        import json
        tips = json.loads(tips_text)
        
        return JSONResponse({"destination": destination, "themes": themes, "tips": tips})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
