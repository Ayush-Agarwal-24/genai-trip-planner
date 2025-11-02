import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

try:
    from .geocode import _city_center  # type: ignore
except ImportError:
    from geocode import _city_center  # type: ignore

try:
    from .search_client import search_web  # type: ignore
except ImportError:
    from search_client import search_web  # type: ignore


WEATHER_API_BASE = "https://weather.googleapis.com/v1"
DEFAULT_FORECAST_DAYS = 5

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_weather_api_key() -> str:
    key = (
        os.getenv("GOOGLE_MAPS_API_KEY")
        or os.getenv("MAPS_API_KEY")
        or os.getenv("VITE_MAPS_API_KEY")
        or ""
    ).strip()
    if not key:
        raise RuntimeError(
            "GOOGLE_MAPS_API_KEY (or MAPS_API_KEY) is required for the Google Weather API."
        )
    return key


def _weather_request(
    endpoint: str,
    parameters: Dict[str, Any],
    field_mask: Optional[str] = None,
) -> Dict[str, Any]:
    key = _resolve_weather_api_key()
    params = dict(parameters)
    params["key"] = key
    headers: Dict[str, str] = {}
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    url = f"{WEATHER_API_BASE}/{endpoint}:lookup"
    query_string = urlencode(params)
    logger.info("Weather API request -> %s?%s", url, query_string)
    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=10,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Weather API request failed ({response.status_code}): {response.text}"
        )
    return response.json()


def _format_display_date(display_date: Dict[str, Any]) -> str:
    year = display_date.get("year")
    month = display_date.get("month")
    day = display_date.get("day")
    if all(isinstance(value, int) and value for value in (year, month, day)):
        return f"{year:04d}-{month:02d}-{day:02d}"
    return ""


def _extract_weather_text(source: Dict[str, Any]) -> str:
    if not isinstance(source, dict):
        return "Unknown"
    condition = source.get("weatherCondition") or source.get("weatherConditions")
    if isinstance(condition, list) and condition:
        condition = condition[0]
    if isinstance(condition, dict):
        localized = condition.get("description")
        if isinstance(localized, dict):
            text = localized.get("text")
            if text:
                return text
        text = condition.get("type")
        if text:
            return text
    text = source.get("condition") or source.get("weather")
    if isinstance(text, str) and text.strip():
        return text.strip()
    return "Unknown"


def _extract_icon(source: Dict[str, Any]) -> Optional[str]:
    if not isinstance(source, dict):
        return None
    condition = source.get("weatherCondition") or source.get("weatherConditions")
    if isinstance(condition, list) and condition:
        condition = condition[0]
    if not isinstance(condition, dict):
        return None
    base = condition.get("iconBaseUri")
    if not base:
        return None
    return f"{base}.svg"


def _extract_daily_forecasts(
    forecast_days: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for item in forecast_days:
        display_date = item.get("displayDate") or {}
        date_str = _format_display_date(display_date)

        max_temp = (item.get("maxTemperature") or {}).get("degrees")
        min_temp = (item.get("minTemperature") or {}).get("degrees")

        part = item.get("daytimeForecast") or item.get("nighttimeForecast") or {}
        condition_text = _extract_weather_text(part)
        icon_uri = _extract_icon(part)

        precipitation = part.get("precipitation") or {}
        probability = precipitation.get("probability") or {}
        percent = probability.get("percent")
        pop_value: Optional[float] = None
        if isinstance(percent, (int, float)):
            pop_value = percent / 100.0

        avg_temp: Optional[float] = None
        if isinstance(max_temp, (int, float)) and isinstance(min_temp, (int, float)):
            avg_temp = round((max_temp + min_temp) / 2.0, 1)
        elif isinstance(max_temp, (int, float)):
            avg_temp = round(max_temp, 1)
        elif isinstance(min_temp, (int, float)):
            avg_temp = round(min_temp, 1)

        formatted.append(
            {
                "date": date_str,
                "temp": avg_temp,
                "temp_min": round(min_temp, 1) if isinstance(min_temp, (int, float)) else None,
                "temp_max": round(max_temp, 1) if isinstance(max_temp, (int, float)) else None,
                "weather": condition_text,
                "icon": icon_uri,
                "pop": pop_value if pop_value is not None else 0.0,
            }
        )
    return formatted


def _fetch_forecast_days(
    lat: float,
    lon: float,
    days: int = DEFAULT_FORECAST_DAYS,
) -> List[Dict[str, Any]]:
    raw = _weather_request(
        "forecast/days",
        {
            "location.latitude": lat,
            "location.longitude": lon,
            "languageCode": "en-US",
            "days": max(1, min(days, 10)),
        },
    )
    forecast_days = raw.get("forecastDays") or []
    if not isinstance(forecast_days, list):
        forecast_days = []
    return _extract_daily_forecasts(forecast_days)


def _fetch_current_conditions(lat: float, lon: float) -> Dict[str, Any]:
    data = _weather_request(
        "currentConditions",
        {
            "location.latitude": lat,
            "location.longitude": lon,
            "languageCode": "en-US",
        },
    )
    payload = data.get("currentConditions") if isinstance(data, dict) else None
    if not isinstance(payload, dict):
        payload = data
    condition = {
        "temperature": (payload.get("temperature") or {}).get("degrees"),
        "feels_like": (payload.get("feelsLikeTemperature") or {}).get("degrees"),
        "humidity": payload.get("relativeHumidity"),
        "wind_speed": ((payload.get("wind") or {}).get("speed") or {}).get("value"),
        "weather": _extract_weather_text(payload or {}),
        "icon": _extract_icon(payload or {}),
        "updated_at": payload.get("currentTime"),
    }
    return condition


@router.get("/api/v1/weather-forecast")
def weather_forecast(
    city: str = Query(..., description="Destination city"),
    days: int = Query(DEFAULT_FORECAST_DAYS, ge=1, le=10),
):
    try:
        lat, lon, _bbox = _city_center(city)
        forecasts = _fetch_forecast_days(lat, lon, days=days)
        current = _fetch_current_conditions(lat, lon)
        payload = {
            "city": city,
            "lat": lat,
            "lon": lon,
            "days": forecasts,
            "current": current,
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "source": "google-weather",
        }
        return JSONResponse(payload)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@router.get("/api/v1/weather-search")
def weather_search(
    city: str = Query(..., description="Destination city"),
    num: int = Query(5, ge=1, le=10),
):
    results = search_web(f"{city} weather forecast", num=num)
    results = search_web(f"{city} weather forecast", num=num)
    return JSONResponse({"city": city, "results": results})
