import os
import json
import time
from typing import Any, Dict, List, Tuple
from fastapi import APIRouter, Body, Query
import httpx
from functools import lru_cache

router = APIRouter()

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
UA = "trip-planner/1.0 (+https://gen-ai-hackathon)"
API_PREFIX = "/api/v1"
GOOGLE_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

NOM_HEADERS = {"User-Agent": UA, "Accept-Language": "en-IN"}
HTTP_TIMEOUT = 10.0

@lru_cache(maxsize=256)
def _city_center(city: str) -> Tuple[float, float, Tuple[float, float, float, float]]:
    if GOOGLE_KEY:
        headers = {
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": "places.location",
            "Content-Type": "application/json"
        }
        payload = {"textQuery": f"{city}, India", "maxResultCount": 1}
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(PLACES_URL, headers=headers, json=payload)
            if r.status_code == 200:
                data = r.json()
                p = (data.get("places") or [{}])[0]
                loc = (p.get("location") or {})
                lat = float(loc.get("latitude", 0))
                lng = float(loc.get("longitude", 0))
                if lat or lng:
                    return lat, lng, (lng - 0.4, lat - 0.35, lng + 0.4, lat + 0.35)
    q = {"q": f"{city}, India", "format": "json", "limit": 1}
    with httpx.Client(timeout=HTTP_TIMEOUT, headers=NOM_HEADERS) as c:
        r = c.get("https://nominatim.openstreetmap.org/search", params=q)
        results = r.json() if r.status_code == 200 else []
        if results:
            rec = results[0]
            lat = float(rec["lat"])
            lng = float(rec["lon"])
            bbox = rec.get("boundingbox") or []
            if len(bbox) == 4:
                return lat, lng, (float(bbox[2]), float(bbox[0]), float(bbox[3]), float(bbox[1]))
            return lat, lng, (lng - 0.4, lat - 0.35, lng + 0.4, lat + 0.35)
    return 22.9734, 78.6569, (78.0, 22.5, 79.3, 23.4)

def _norm(s: str) -> str:
    return " ".join((s or "").split())

def _extract_from_itinerary(it: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    for d in (it.get("days") or []):
        acts = d.get("activities") or []
        for a in acts:
            v = a.get("location")
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
    return out

def _as_list(payload: Any) -> List[str]:
    if isinstance(payload, list):
        return [str(x) for x in payload]
    if isinstance(payload, dict):
        if "locations" in payload:
            return [str(x) for x in (payload.get("locations") or [])]
        if "itinerary" in payload and isinstance(payload["itinerary"], dict):
            return _extract_from_itinerary(payload["itinerary"])
        if "days" in payload and isinstance(payload["days"], list):
            return _extract_from_itinerary({"days": payload["days"]})
    return []

def _dedupe_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        if x and x not in seen:
            out.append(x)
            seen.add(x)
    return out

def _search_places_google(queries: List[str], city: str, lat: float, lng: float) -> Dict[str, Dict[str, Any]]:
    if not GOOGLE_KEY:
        return {}
    headers = {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress",
        "Content-Type": "application/json"
    }
    out: Dict[str, Dict[str, Any]] = {}
    with httpx.Client(timeout=HTTP_TIMEOUT) as c:
        for q in queries:
            text = f"{q}, {city}, India"
            payload = {
                "textQuery": text,
                "maxResultCount": 1,
                "locationBias": {
                    "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 30000}
                }
            }
            r = c.post(PLACES_URL, headers=headers, json=payload)
            if r.status_code == 200:
                data = r.json()
                places = data.get("places") or []
                if places:
                    p = places[0]
                    loc = p.get("location") or {}
                    out[q] = {
                        "name": (p.get("displayName") or {}).get("text"),
                        "address": p.get("formattedAddress"),
                        "place_id": p.get("id"),
                        "lat": loc.get("latitude"),
                        "lon": loc.get("longitude"),
                        "confidence": 0.95
                    }
            elif r.status_code in (429, 500, 503):
                time.sleep(0.6)
    return out

def _search_places_nominatim(queries: List[str], city: str, bbox: Tuple[float, float, float, float]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    left, bottom, right, top = bbox
    with httpx.Client(timeout=HTTP_TIMEOUT, headers=NOM_HEADERS) as c:
        for q in queries:
            params = {
                "q": f"{q}, {city}, India",
                "format": "json",
                "limit": 1,
                "viewbox": f"{left},{top},{right},{bottom}",
                "bounded": 1
            }
            r = c.get("https://nominatim.openstreetmap.org/search", params=params)
            if r.status_code == 200:
                results = r.json() or []
                if results:
                    rec = results[0]
                    out[q] = {
                        "name": rec.get("display_name"),
                        "address": rec.get("display_name"),
                        "place_id": rec.get("osm_id"),
                        "lat": float(rec.get("lat")),
                        "lon": float(rec.get("lon")),
                        "confidence": 0.7
                    }
            elif r.status_code in (429, 500, 503):
                time.sleep(0.8)
    return out

@router.post(f"{API_PREFIX}/geocode-locations")
def geocode_locations(payload: Any = Body(...), city: str = Query("", alias="city")) -> Dict[str, Any]:
    raw = _as_list(payload)
    queries = _dedupe_keep_order([_norm(x) for x in raw])
    if not queries:
        return {"results": {}}
    city_label = _norm(city or "")
    lat, lng, bbox = _city_center(city_label or "India")
    results: Dict[str, Dict[str, Any]] = {}
    g = _search_places_google(queries, city_label or "India", lat, lng)
    results.update(g)
    missing = [q for q in queries if q not in results]
    if missing:
        results.update(_search_places_nominatim(missing, city_label or "India", bbox))
    return {"results": results}
