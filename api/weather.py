import os
import requests
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta

OPEN_WEATHER_API_KEY = os.getenv("OPEN_WEATHER_API_KEY")
OPEN_WEATHER_BASE = "https://api.openweathermap.org"

router = APIRouter()

def geocode_city(city: str):
    url = f"{OPEN_WEATHER_BASE}/geo/1.0/direct"
    params = {"q": city, "limit": 5, "appid": OPEN_WEATHER_API_KEY}
    resp = requests.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"City '{city}' not found")
    return data[0]["lat"], data[0]["lon"]

@router.get("/api/v1/weather-forecast")
def weather_forecast(
    city: str = Query(..., description="Destination city"),
):
    try:
        lat, lon = geocode_city(city)
        url = f"{OPEN_WEATHER_BASE}/data/2.5/forecast"
        params = {
            "lat": lat,
            "lon": lon,
            "units": "metric",
            "appid": OPEN_WEATHER_API_KEY
        }
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        
        # Process 3-hour data into daily summaries
        daily_data = {}
        for item in data.get("list", []):
            dt = datetime.utcfromtimestamp(item["dt"])
            date_str = dt.strftime("%Y-%m-%d")
            if date_str not in daily_data:
                daily_data[date_str] = {
                    "temps": [], "temp_mins": [], "temp_maxes": [],
                    "weathers": {}, "icons": {}, "pops": []
                }
            daily_data[date_str]["temps"].append(item["main"]["temp"])
            daily_data[date_str]["temp_mins"].append(item["main"]["temp_min"])
            daily_data[date_str]["temp_maxes"].append(item["main"]["temp_max"])
            weather = item["weather"][0]["main"]
            icon = item["weather"][0]["icon"]
            daily_data[date_str]["weathers"][weather] = daily_data[date_str]["weathers"].get(weather, 0) + 1
            daily_data[date_str]["icons"][icon] = daily_data[date_str]["icons"].get(icon, 0) + 1
            daily_data[date_str]["pops"].append(item.get("pop", 0))

        result = []
        for date_str, day_data in daily_data.items():
            result.append({
                "date": date_str,
                "temp": round(sum(day_data["temps"]) / len(day_data["temps"]), 1),
                "temp_min": round(min(day_data["temp_mins"]), 1),
                "temp_max": round(max(day_data["temp_maxes"]), 1),
                "weather": max(day_data["weathers"], key=day_data["weathers"].get),
                "icon": max(day_data["icons"], key=day_data["icons"].get),
                "pop": max(day_data["pops"]),
            })
        
        warning = "5-day forecast with 3-hour intervals. Daily summary is an average."
        return JSONResponse({"city": city, "lat": lat, "lon": lon, "days": result, "warning": warning})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
