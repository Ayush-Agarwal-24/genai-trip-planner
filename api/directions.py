import os
import requests
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

GOOGLE_MAPS_API_KEY = os.getenv("MAPS_API_KEY")
GOOGLE_MAPS_BASE = "https://maps.googleapis.com/maps/api"

router = APIRouter()
API_PREFIX = "/api/v1"

@router.post(f"{API_PREFIX}/directions")
def get_directions(
    origin: dict = Body(...),
    destination: dict = Body(...),
    waypoints: list[dict] = Body(...)
):
    try:
        url = f"{GOOGLE_MAPS_BASE}/directions/json"
        params = {
            "origin": f"{origin['lat']},{origin['lng']}",
            "destination": f"{destination['lat']},{destination['lng']}",
            "waypoints": "|".join([f"{wp['lat']},{wp['lng']}" for wp in waypoints]),
            "key": GOOGLE_MAPS_API_KEY
        }
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        return JSONResponse(data)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
