import os
import requests
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

OPEN_WEATHER_API_KEY = os.getenv("OPEN_WEATHER_API_KEY")
OPEN_WEATHER_BASE = "https://api.openweathermap.org"

router = APIRouter()

@router.post("/api/v1/geocode-locations")
def geocode_locations(locations: list[str] = Body(...)):
    try:
        results = {}
        for location in locations:
            try:
                url = f"{OPEN_WEATHER_BASE}/geo/1.0/direct"
                params = {"q": location, "limit": 1, "appid": OPEN_WEATHER_API_KEY}
                resp = requests.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                if data:
                    results[location] = {"lat": data[0]["lat"], "lon": data[0]["lon"]}
                else:
                    results[location] = None
            except Exception:
                results[location] = None
        return JSONResponse({"results": results})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
