# -*- coding: utf-8 -*-
from __future__ import annotations
import json
import logging
import os
import re
import traceback
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Set, Tuple
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from uuid import uuid4
import mimetypes

from dotenv import load_dotenv

import google.genai as genai
from google.genai import types

load_dotenv()

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", os.getenv("GCP_PROJECT_ID", ""))
os.environ.setdefault(
    "GOOGLE_CLOUD_LOCATION",
    os.getenv("GCP_GLOBAL_LOCATION") or os.getenv("GCP_LOCATION") or "global",
)
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")  # tell SDK to use Vertex AI

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


API_PREFIX = "/api/v1"
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
LOCATION = os.getenv("GCP_LOCATION", "us-central1")
GCP_GLOBAL_LOCATION = os.getenv("GCP_GLOBAL_LOCATION", "global")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
ENABLE_LIVE = os.getenv("ENABLE_LIVE_SERVICES", "false").lower() == "true"
MAX_GEMINI_ATTEMPTS = 1

app = FastAPI(title="Trip Planner API", version="0.1.0")

FASHION_MALE_KEYWORDS = {
    "men",
    "male",
    "mens",
    "groom",
    "kurta",
    "pathani",
    "bandhgala",
    "waistcoat",
    "nehru jacket",
    "sherwani",
    "shirt",
    "trouser",
    "chinos",
    "suit",
    "blazer",
    "sherwanis",
}

FASHION_FEMALE_KEYWORDS = {
    "women",
    "female",
    "womens",
    "lady",
    "ladies",
    "saree",
    "lehenga",
    "gown",
    "dress",
    "anarkali",
    "salwar",
    "kameez",
    "dupatta",
    "kurti",
    "kurta set",
    "palazzo",
    "skirt",
    "tops",
    "blouse",
    "lehenga",
}

FASHION_KID_KEYWORDS = {
    "kid",
    "kids",
    "child",
    "children",
    "boy",
    "boys",
    "girl",
    "girls",
    "teen",
    "tween",
    "junior",
    "infant",
    "toddler",
    "young",
    "youth",
}

FASHION_ACCESSORY_KEYWORDS = {
    "bag",
    "backpack",
    "scarf",
    "shawl",
    "watch",
    "belt",
    "wallet",
    "sandal",
    "shoe",
    "sneaker",
    "loafer",
    "bracelet",
    "necklace",
    "earring",
    "earrings",
    "hat",
    "cap",
    "sunglasses",
    "glove",
    "gloves",
    "tech",
    "gadget",
}


def _normalize_fashion_text(entry: Dict[str, Any]) -> str:
    parts: List[str] = []
    for field in ("title", "description", "shopping_keywords", "notes"):
        value = entry.get(field)
        if isinstance(value, str):
            parts.append(value)
    tags = entry.get("style_tags")
    if isinstance(tags, list):
        parts.extend(str(tag) for tag in tags if isinstance(tag, str))
    return " ".join(parts).lower()


def _fashion_tokens(text: str) -> Set[str]:
    words = re.findall(r"[a-z]+", text.lower())
    tokens: Set[str] = set(words)
    tokens.update(" ".join(words[i : i + 2]) for i in range(len(words) - 1))
    return {token for token in tokens if token}


def _infer_fashion_bucket(entry: Dict[str, Any], fallback: str) -> str:
    text = _normalize_fashion_text(entry)
    if not text:
        return fallback

    tokens = _fashion_tokens(text)
    has_male = any(token in tokens for token in FASHION_MALE_KEYWORDS)
    has_female = any(token in tokens for token in FASHION_FEMALE_KEYWORDS)
    has_kid = any(token in tokens for token in FASHION_KID_KEYWORDS)
    has_accessory = any(token in tokens for token in FASHION_ACCESSORY_KEYWORDS)
    if "age" in tokens or re.search(r"\b\d+\s*(?:yrs?|years?)\b", text):
        has_kid = True

    if has_kid and not (has_male or has_female):
        return "kids"
    if has_female and not has_male:
        return "women"
    if has_male and not has_female:
        return "men"
    if has_accessory and not (has_male or has_female or has_kid):
        return "accessories"

    if has_female and fallback != "women":
        return "women"
    if has_male and fallback != "men":
        return "men"
    if has_kid and fallback != "kids":
        return "kids"
    if has_accessory and fallback != "accessories":
        return "accessories"
    return fallback



def _attach_activity_images(itinerary: Dict[str, Any]) -> None:
    try:
        from .search_client import search_images as _search_images  # type: ignore
    except ImportError:
        from search_client import search_images as _search_images  # type: ignore

    cache: Dict[str, List[Dict[str, Any]]] = {}
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for activity in day.get("activities") or []:
            if not isinstance(activity, dict):
                continue
            key_candidates = [
                activity.get("location"),
                activity.get("title"),
            ]
            key = next(
                (str(candidate).strip() for candidate in key_candidates if isinstance(candidate, str) and candidate.strip()),
                None,
            )
            if not key:
                activity["images"] = []
                continue
            cache_key = key.lower()
            if cache_key not in cache:
                query = f"{key} travel photo"
                try:
                    images = _search_images(query, num=3)
                except HTTPException:
                    images = []
                cache[cache_key] = [
                    {
                        "image_url": img.get("link"),
                        "thumbnail_url": img.get("thumbnail"),
                        "context_url": img.get("context"),
                        "title": img.get("title"),
                    }
                    for img in images
                    if img.get("link")
                ]
            activity["images"] = cache.get(cache_key, [])


def _normalize_itinerary(itinerary: Dict[str, Any], prefs: TripPreferences) -> None:
    days = itinerary.get("days")
    if not isinstance(days, list):
        itinerary["days"] = []
        return

    try:
        start_date = date.fromisoformat(prefs.startDate)
    except Exception:
        start_date = None

    for day_index, day in enumerate(days):
        if not isinstance(day, dict):
            continue

        if not isinstance(day.get("dateLabel"), str) or not day["dateLabel"].strip():
            day["dateLabel"] = f"Day {day_index + 1}"
        if start_date and (
            "date" not in day or not isinstance(day.get("date"), str) or not day["date"].strip()
        ):
            day["date"] = (start_date + timedelta(days=day_index)).isoformat()
        if not isinstance(day.get("summary"), str) or not day["summary"].strip():
            motifs = ", ".join(prefs.themes) or "local highlights"
            day["summary"] = f"Tailored highlights across {prefs.destination} focusing on {motifs}."

        activities = day.get("activities")
        if not isinstance(activities, list):
            day["activities"] = []
            continue

        for activity_index, activity in enumerate(activities):
            if not isinstance(activity, dict):
                activities[activity_index] = {}
                activity = activities[activity_index]

            if not isinstance(activity.get("title"), str) or not activity["title"].strip():
                activity["title"] = f"Experience {activity_index + 1}"
            if not isinstance(activity.get("description"), str) or not activity["description"].strip():
                activity["description"] = "Curated moment designed for this trip."
            if not isinstance(activity.get("location"), str) or not activity["location"].strip():
                activity["location"] = prefs.destination

            time_value = activity.get("time")
            if not isinstance(time_value, str) or not time_value.strip():
                slot_hour = 9 + (activity_index * 2)
                slot_hour = max(6, min(slot_hour, 22))
                activity["time"] = f"{slot_hour:02d}:00"
            else:
                activity["time"] = time_value.strip()

            cost_value = activity.get("cost")
            if isinstance(cost_value, (int, float)):
                activity["cost"] = int(cost_value)
            elif isinstance(cost_value, str):
                cleaned = cost_value.strip()
                if cleaned.isdigit():
                    activity["cost"] = int(cleaned)
                else:
                    activity["cost"] = cleaned
            else:
                activity["cost"] = "Included"

            source_value = activity.get("source")
            if not isinstance(source_value, str) or not source_value.strip():
                activity["source"] = "ai"
            else:
                activity["source"] = source_value.strip()

            if "images" not in activity or not isinstance(activity.get("images"), list):
                activity["images"] = []

    if not isinstance(itinerary.get("totalEstimatedCost"), (int, float)):
        itinerary["totalEstimatedCost"] = _extract_total_cost(itinerary)

    if not isinstance(itinerary.get("costBreakdown"), list):
        itinerary["costBreakdown"] = []


try:
    from .weather import router as weather_router
except ImportError:
    from weather import router as weather_router
app.include_router(weather_router)

try:
    from .city_images import router as city_images_router
except ImportError:
    from city_images import router as city_images_router
app.include_router(city_images_router)

try:
    from .image_search import router as image_search_router
except ImportError:
    from image_search import router as image_search_router
app.include_router(image_search_router)

try:
    from .smart_tips import router as smart_tips_router
except ImportError:
    from smart_tips import router as smart_tips_router
app.include_router(smart_tips_router)

try:
    from .translate import router as translate_router
except ImportError:
    from translate import router as translate_router
app.include_router(translate_router)

try:
    from .geocode import router as geocode_router
except ImportError:
    from geocode import router as geocode_router
app.include_router(geocode_router)

try:
    from .weather_summary import router as weather_summary_router
except ImportError:
    from weather_summary import router as weather_summary_router
app.include_router(weather_summary_router)

try:
    from .voice_assistant import router as voice_router
except ImportError:
    from voice_assistant import router as voice_router
app.include_router(voice_router)

try:
    from .search_client import search_images, search_web
except ImportError:
    from search_client import search_images, search_web

try:
    from .directions import router as directions_router
except ImportError:
    from directions import router as directions_router
app.include_router(directions_router)

try:
    from .storage import save_itinerary, load_itinerary
except ImportError:
    from storage import save_itinerary, load_itinerary  # type: ignore

STATIC_DIR = Path("static")
GEN_DIR = STATIC_DIR / "generated"
GEN_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

_cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _cors_origins if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

class TripPreferences(BaseModel):
    origin: str
    destination: str
    startDate: str
    endDate: str
    budget: int = Field(ge=1000, le=500000)
    themes: list[str]
    travellers: int = Field(ge=1, le=6)
    language: str = "English"
    enableLiveData: bool = True
    @field_validator("themes")
    @classmethod
    def ensure_themes(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("Select at least one theme")
        return value

class ItineraryRequest(BaseModel):
    preferences: TripPreferences

class ImageGenerationRequest(BaseModel):
    prompt: str


client = genai.Client(http_options=types.HttpOptions(api_version="v1"))

def build_base_payload(prefs: TripPreferences) -> dict[str, Any]:
    return {
        "createdAt": datetime.utcnow().isoformat(),
        "destination": f"{prefs.destination}, India",
        "budget": prefs.budget,
        "currency": "INR",
        "totalEstimatedCost": int(prefs.budget * 0.9),
        "days": [],
        "costBreakdown": [],
    }

def _extract_total_cost(itinerary: dict[str, Any]) -> int:
    total = itinerary.get("totalEstimatedCost")
    if isinstance(total, (int, float)):
        return int(total)
    breakdown = itinerary.get("costBreakdown") or []
    running_total = 0
    for item in breakdown:
        if isinstance(item, dict) and isinstance(item.get("amount"), (int, float)):
            running_total += int(item["amount"])
    return running_total

def _parse_minutes(value: str) -> int | None:
    if not value or not isinstance(value, str):
        return None
    try:
        hour, minute = value.split(":", 1)
        return int(hour) * 60 + int(minute)
    except Exception:
        return None

def _clean_snippet(text: str) -> str:
    if not text:
        return ""
    cleaned = text.replace("?", "-").replace("?", "-")
    return re.sub(r"\s+", " ", cleaned).strip()

def generate_day_narrations(itinerary: dict[str, Any], prefs: TripPreferences) -> list[dict[str, Any]]:
    narrations: list[dict[str, Any]] = []
    days = itinerary.get("days") or []
    destination = prefs.destination if isinstance(prefs.destination, str) else "your destination"
    for index, day in enumerate(days, start=1):
        label = day.get("dateLabel") or f"Day {index}"
        summary = _clean_snippet(day.get("summary", ""))
        activities = day.get("activities") or []
        highlight_titles = [ _clean_snippet(a.get("title", "")) for a in activities if a.get("title") ]
        highlight_titles = [title for title in highlight_titles if title]
        morning = highlight_titles[0] if highlight_titles else None
        evening = highlight_titles[-1] if highlight_titles else None
        script_bits = [f"Day {index} in {destination}: {summary or 'tailored experiences await.'}"]
        if morning and evening and morning != evening:
            script_bits.append(f"Start with {morning} and wrap up at {evening}.")
        elif highlight_titles:
            script_bits.append(f"Expect {highlight_titles[0]} as a signature moment.")
        advisory = itinerary.get("weatherAdvisory")
        if isinstance(advisory, str) and advisory.strip():
            script_bits.append(f"Weather watch: {advisory.strip()}")
        script = " ".join(script_bits)
        narrations.append(
            {
                "day": label,
                "script": script,
                "mood": "uplifting",
                "lengthSeconds": max(18, min(45, len(script.split()) * 2)),
            }
        )
    return narrations

def compute_trip_insights(itinerary: dict[str, Any], prefs: TripPreferences) -> dict[str, Any]:
    budget = prefs.budget if isinstance(prefs.budget, (int, float)) else 0
    total_cost = _extract_total_cost(itinerary)
    total_cost = total_cost or budget or 1

    alerts: list[str] = []
    actions: list[str] = []

    # Budget fit
    if budget <= 0:
        budget_score = 75
    elif total_cost <= budget:
        cushion = budget - total_cost
        ratio = cushion / max(budget, 1)
        budget_score = min(100, int(82 + ratio * 25))
        if cushion > 0.15 * budget:
            actions.append("Reinvest budget buffer into a signature local experience.")
    else:
        overshoot = total_cost - budget
        ratio = overshoot / max(budget, 1)
        budget_score = max(30, int(82 - ratio * 90))
        alerts.append(f"Projected spend exceeds budget by ?{int(overshoot):,}.")
        actions.append("Enable budget guardrails to auto-swap premium slots with value picks.")

    # Logistics flow
    days = itinerary.get("days") or []
    spans: list[int] = []
    activity_counts: list[int] = []
    for day in days:
        activities = day.get("activities") or []
        activity_counts.append(len(activities))
        minutes = [m for m in (_parse_minutes(a.get("time")) for a in activities) if m is not None]
        if minutes:
            spans.append(max(minutes) - min(minutes))
    logistics_score = 82
    if spans:
        avg_span = sum(spans) / len(spans)
        if avg_span > 720:
            logistics_score -= 12
        if any(span > 840 for span in spans):
            logistics_score -= 10
    if activity_counts:
        avg_count = sum(activity_counts) / len(activity_counts)
        if avg_count > 4.2:
            logistics_score -= 8
            actions.append("Trim one activity from the busiest day to reduce rush between stops.")
    logistics_score = max(35, min(100, int(round(logistics_score))))

    # Weather resilience
    advisory_text = itinerary.get("weatherAdvisory") or ""
    weather_score = 90
    if isinstance(advisory_text, str) and advisory_text.strip():
        text_lower = advisory_text.lower()
        if any(token in text_lower for token in ("storm", "cyclone", "heavy", "extreme")):
            weather_score = 55
            alerts.append("Severe weather flagged. Prepare plan B indoor experiences.")
            actions.append("Shift exposed activities indoors on risky days to stay comfortable.")
        elif "rain" in text_lower or "shower" in text_lower:
            weather_score = 70
            actions.append("Pack light rain gear and shift open-air slots earlier in the day.")
        elif "heat" in text_lower:
            weather_score = 68
        else:
            weather_score = 78
    weather_score = max(30, min(100, int(weather_score)))

    # Sustainability & impact
    activities_blob = " ".join(
        _clean_snippet(a.get("title", "")) + " " + _clean_snippet(a.get("description", ""))
        for day in days
        for a in (day.get("activities") or [])
    ).lower()
    green_hits = sum(keyword in activities_blob for keyword in ("walk", "walking", "cycle", "public", "metro", "local market"))
    carbon_hits = sum(keyword in activities_blob for keyword in ("taxi", "cab", "private", "drive", "suv"))
    sustainability_score = 74 + (green_hits * 4) - (carbon_hits * 5)
    transport_cost = 0
    breakdown = itinerary.get("costBreakdown") or []
    for item in breakdown:
        if isinstance(item, dict) and isinstance(item.get("category"), str) and "transport" in item["category"].lower():
            if isinstance(item.get("amount"), (int, float)):
                transport_cost += item["amount"]
    if total_cost:
        share = transport_cost / total_cost
        if share > 0.35:
            sustainability_score -= 12
            actions.append("Swap at least one cab ride for a curated walking or metro experience.")
        elif share < 0.15:
            sustainability_score += 6
    sustainability_score = max(25, min(100, int(round(sustainability_score))))

    # Experience fit
    theme_keywords = [theme.lower() for theme in (prefs.themes or [])]
    text_blob = (activities_blob + " " + " ".join(_clean_snippet(day.get("summary", "")) for day in days)).lower()
    matches = sum(1 for keyword in theme_keywords if keyword and keyword in text_blob)
    coverage = matches / len(theme_keywords) if theme_keywords else 1
    experience_score = int(68 + coverage * 30)
    experience_score = max(35, min(100, experience_score))
    if coverage < 0.5 and theme_keywords:
        actions.append("Infuse more of the selected themes into late-day slots for balance.")

    axes = [
        {
            "id": "budget",
            "label": "Budget Fit",
            "score": budget_score,
            "status": "great" if budget_score >= 80 else ("caution" if budget_score >= 60 else "risk"),
            "explanation": "Compares projected spend against your stated budget.",
        },
        {
            "id": "logistics",
            "label": "Logistics Flow",
            "score": logistics_score,
            "status": "great" if logistics_score >= 80 else ("caution" if logistics_score >= 60 else "risk"),
            "explanation": "Looks at activity density and travel day stretch.",
        },
        {
            "id": "weather",
            "label": "Weather Resilience",
            "score": weather_score,
            "status": "great" if weather_score >= 80 else ("caution" if weather_score >= 60 else "risk"),
            "explanation": "Reflects risk from current advisory notes.",
        },
        {
            "id": "impact",
            "label": "Sustainability",
            "score": sustainability_score,
            "status": "great" if sustainability_score >= 80 else ("caution" if sustainability_score >= 60 else "risk"),
            "explanation": "Balances low-carbon modes and community-first picks.",
        },
        {
            "id": "experience",
            "label": "Experience Fit",
            "score": experience_score,
            "status": "great" if experience_score >= 80 else ("caution" if experience_score >= 60 else "risk"),
            "explanation": "Measures alignment between themes and planned highlights.",
        },
    ]

    overall = int(round(sum(axis["score"] for axis in axes) / len(axes)))
    badge = "Launch-ready" if overall >= 80 else ("Tune & shine" if overall >= 65 else "Needs attention")

    return {
        "overallScore": overall,
        "badge": badge,
        "axes": axes,
        "alerts": alerts,
        "suggestedActions": actions,
        "generatedAt": datetime.utcnow().isoformat(),
    }

def _days_between_inclusive(a: str, b: str) -> int:
    sa = date.fromisoformat(a)
    sb = date.fromisoformat(b)
    d = (sb - sa).days + 1
    return max(1, d)

def _system_instruction(prefs: TripPreferences, day_count: int) -> str:
    t = ", ".join(prefs.themes)
    return (
        "Write terse JSON in English. Keep all strings short. "
        "summary = 32 words. title = 10 words. description = 32 words. "
        "Use 24h times like 09:00. Costs are integers. "
        f"Destination is {prefs.destination}, India only. "
        "Mark source as \"places-api\" for real POIs, else \"ai\". "
        "Each activity object MUST include keys time, title, description, location, cost, source. "
        f"Create exactly {day_count} days with 3-4 activities each."
    )

def _response_schema(_day_count: int) -> dict:
    # Constrain nested shapes so the model returns valid objects for days and activities
    return {
        "type": "OBJECT",
        "properties": {
            "destination": {"type": "STRING"},
            "budget": {"type": "NUMBER"},
            "currency": {"type": "STRING"},
            "totalEstimatedCost": {"type": "NUMBER", "nullable": True},
            "weatherAdvisory": {"type": "STRING", "nullable": True},
            "costBreakdown": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "category": {"type": "STRING"},
                        "amount": {"type": "NUMBER"},
                        "notes": {"type": "STRING", "nullable": True},
                    },
                    "required": ["category", "amount"],
                },
            },
            "days": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "dateLabel": {"type": "STRING", "nullable": True},
                        "date": {"type": "STRING", "nullable": True},
                        "summary": {"type": "STRING"},
                        "activities": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "time": {"type": "STRING"},
                                    "title": {"type": "STRING"},
                                    "description": {"type": "STRING"},
                                    "location": {"type": "STRING"},
                                    "cost": {"type": "NUMBER"},
                                    "source": {"type": "STRING"},
                                },
                                "required": [
                                    "time",
                                    "title",
                                    "description",
                                    "location",
                                    "cost",
                                    "source",
                                ],
                            },
                        },
                        "accommodation": {
                            "type": "OBJECT",
                            "nullable": True,
                            "properties": {
                                "name": {"type": "STRING"},
                                "cost": {"type": "NUMBER", "nullable": True},
                                "notes": {"type": "STRING", "nullable": True},
                            },
                        },
                    },
                    "required": ["summary", "activities"],
                },
            },
            "meta": {"type": "OBJECT", "nullable": True},
        },
        "required": ["destination", "budget", "currency", "days"],
    }


def _fashion_array_schema() -> dict:
    return {
        "type": "ARRAY",
        "items": {
            "type": "OBJECT",
            "properties": {
                "title": {"type": "STRING"},
                "description": {"type": "STRING"},
                "style_tags": {"type": "ARRAY", "items": {"type": "STRING"}},
                "shopping_keywords": {"type": "STRING"},
                "price_in_inr": {"type": "NUMBER"},
                "weather_note": {"type": "STRING"},
            },
            "required": ["title", "description", "shopping_keywords", "price_in_inr", "style_tags", "weather_note"],
        },
        "minItems": 4,
        "maxItems": 4,
    }

def _fashion_fallback(city: str) -> Dict[str, List[Dict[str, Any]]]:
    city_ref = city or "the destination"
    return {
        'men': [
            {
                'title': 'Linen Shirt and Chinos',
                'description': f'Breathable linen shirt with light chinos ideal for evenings in {city_ref}.',
                'style_tags': ['smart casual', 'linen', 'lightweight'],
                'shopping_keywords': f"men linen shirt chinos {city_ref}",
                'price_in_inr': 6000,
                'weather_note': 'Keeps you cool during warm afternoons.'
            },
            {
                'title': 'Heritage Kurta Set',
                'description': f'Printed cotton kurta with churidar suited for heritage walks in {city_ref}.',
                'style_tags': ['ethnic', 'cotton', 'breathable'],
                'shopping_keywords': f"men cotton kurta set {city_ref}",
                'price_in_inr': 4500,
                'weather_note': 'Comfortable for humid mornings.'
            },
            {
                'title': 'Evening Bandhgala',
                'description': f'Lightweight bandhgala jacket for fine dining around {city_ref}.',
                'style_tags': ['evening', 'tailored'],
                'shopping_keywords': f"men bandhgala evening {city_ref}",
                'price_in_inr': 7200,
                'weather_note': 'Adds warmth for breezy nights.'
            },
            {
                'title': 'Monsoon Travel Jacket',
                'description': 'Water-resistant travel jacket with concealed hood for sudden showers.',
                'style_tags': ['outerwear', 'travel', 'water resistant'],
                'shopping_keywords': f"men travel jacket water resistant {city_ref}",
                'price_in_inr': 5800,
                'weather_note': 'Shields you from surprise rain.'
            },
            {
                'title': 'Heritage Walking Sneakers',
                'description': f'Cushioned sneakers with grip for cobbled streets in {city_ref}.',
                'style_tags': ['footwear', 'walking'],
                'shopping_keywords': f"men walking sneakers heritage {city_ref}",
                'price_in_inr': 4200,
                'weather_note': 'Breathable mesh keeps feet cool.'
            },
        ],
        'women': [
            {
                'title': 'Floral Kurti and Palazzo Set',
                'description': f'Airy kurti with palazzo pants for market strolls in {city_ref}.',
                'style_tags': ['ethnic fusion', 'lightweight'],
                'shopping_keywords': f"women floral kurti palazzo {city_ref}",
                'price_in_inr': 5200,
                'weather_note': 'Flowy silhouette keeps you cool.'
            },
            {
                'title': 'Evening Silk Saree',
                'description': f'Regal silk saree perfect for cultural evenings in {city_ref}.',
                'style_tags': ['evening', 'silk', 'heritage'],
                'shopping_keywords': f"women silk saree evening {city_ref}",
                'price_in_inr': 8500,
                'weather_note': 'Light silk drape works for indoor venues.'
            },
            {
                'title': 'Layered Maxi Dress',
                'description': 'Soft maxi dress paired with a shrug for day-to-night transitions.',
                'style_tags': ['maxi', 'layered', 'travel'],
                'shopping_keywords': f"women maxi dress travel {city_ref}",
                'price_in_inr': 4800,
                'weather_note': 'Shrug adds warmth for breezy nights.'
            },
            {
                'title': 'Heritage Jutti Flats',
                'description': f'Embroidered juttis that cushion long heritage walks in {city_ref}.',
                'style_tags': ['footwear', 'heritage'],
                'shopping_keywords': f"women jutti flats {city_ref}",
                'price_in_inr': 2600,
                'weather_note': 'Closed toe protects against dust.'
            },
            {
                'title': 'Monsoon-Friendly Cape',
                'description': 'Packable cape with water-repellent finish for sudden showers.',
                'style_tags': ['outerwear', 'packable'],
                'shopping_keywords': f"women travel cape rain {city_ref}",
                'price_in_inr': 3900,
                'weather_note': 'Shields against light rain and wind.'
            },
        ],
        'kids': [
            {
                'title': 'Cotton Kurta and Dhoti Set',
                'description': 'Soft cotton kurta-dhoti set allowing free movement for kids.',
                'style_tags': ['ethnic', 'cotton'],
                'shopping_keywords': f"kids cotton kurta dhoti {city_ref}",
                'price_in_inr': 2500,
                'weather_note': 'Breathable fabric for warm afternoons.'
            },
            {
                'title': 'Travel Jogger Set',
                'description': 'Stretchy joggers with graphic tee for sightseeing days.',
                'style_tags': ['casual', 'stretch'],
                'shopping_keywords': f"kids travel jogger set {city_ref}",
                'price_in_inr': 2200,
                'weather_note': 'Lightweight knit keeps kids comfy.'
            },
            {
                'title': 'Rain-Ready Poncho',
                'description': 'Foldable poncho with playful print for sudden rain.',
                'style_tags': ['outerwear', 'rainwear'],
                'shopping_keywords': f"kids rain poncho {city_ref}",
                'price_in_inr': 1500,
                'weather_note': 'Protects from monsoon drizzle.'
            },
            {
                'title': 'Evening Ethnic Gown',
                'description': 'Light shimmer gown with soft lining for special evenings.',
                'style_tags': ['occasion wear', 'evening'],
                'shopping_keywords': f"kids evening gown {city_ref}",
                'price_in_inr': 3600,
                'weather_note': 'Comfortable lining prevents irritation.'
            },
            {
                'title': 'Adventure Sandals',
                'description': 'Grippy sandals built for theme parks and fort climbs.',
                'style_tags': ['footwear', 'adventure'],
                'shopping_keywords': f"kids adventure sandals {city_ref}",
                'price_in_inr': 1800,
                'weather_note': 'Open design keeps feet cool.'
            },
        ],
        'accessories': [
            {
                'title': 'Heritage Sling Bag',
                'description': 'Compact sling bag with secure pockets for day trips.',
                'style_tags': ['bag', 'travel'],
                'shopping_keywords': f"travel sling bag {city_ref}",
                'price_in_inr': 2800,
                'weather_note': 'Water-repellent finish for light rain.'
            },
            {
                'title': 'Monsoon Travel Umbrella',
                'description': 'Wind-resistant compact umbrella for unpredictable showers.',
                'style_tags': ['umbrella', 'monsoon'],
                'shopping_keywords': f"travel umbrella {city_ref}",
                'price_in_inr': 1500,
                'weather_note': 'Essential for sudden downpours.'
            },
            {
                'title': 'Cooling Scarf',
                'description': 'Quick-dry scarf that doubles as sun protection.',
                'style_tags': ['scarf', 'sun protection'],
                'shopping_keywords': f"cooling scarf travel {city_ref}",
                'price_in_inr': 1200,
                'weather_note': 'Soak and wring to stay cool in heat.'
            },
            {
                'title': 'Travel Tech Pouch',
                'description': 'Organiser for chargers, SIM cards, and travel docs.',
                'style_tags': ['tech', 'organiser'],
                'shopping_keywords': f"travel tech pouch {city_ref}",
                'price_in_inr': 1900,
                'weather_note': 'Keeps gadgets safe from humidity.'
            },
            {
                'title': 'Polarised Sunglasses',
                'description': 'Polarised shades with UV protection for bright days.',
                'style_tags': ['sunglasses', 'uv protection'],
                'shopping_keywords': f"polarised sunglasses travel {city_ref}",
                'price_in_inr': 3200,
                'weather_note': 'Reduces glare during noon walks.'
            },
        ],
    }

def _is_valid_fashion_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    required_fields = {"title", "description", "shopping_keywords", "price_in_inr", "style_tags", "weather_note"}
    for category in ("men", "women", "kids", "accessories"):
        entries = payload.get(category)
        if not isinstance(entries, list) or len(entries) != 4:
            return False
        for entry in entries:
            if not isinstance(entry, dict):
                return False
            if not required_fields.issubset(entry.keys()):
                return False
            if not isinstance(entry.get("title"), str) or not entry["title"].strip():
                return False
            if not isinstance(entry.get("description"), str) or not entry["description"].strip():
                return False
            if not isinstance(entry.get("shopping_keywords"), str) or not entry["shopping_keywords"].strip():
                return False
            weather_note = entry.get("weather_note")
            if not isinstance(weather_note, str) or not weather_note.strip():
                return False
    return True

def _prepare_fashion_results(city: str, budget: int | None, payload: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    categories = ("men", "women", "kids", "accessories")
    image_cache: Dict[str, List[Dict[str, Any]]] = {}

    def _fetch_images(query: str) -> List[Dict[str, Any]]:
        key = query.strip().lower()
        if key not in image_cache:
            try:
                image_cache[key] = search_images(query, num=4)
            except HTTPException:
                image_cache[key] = []
        return image_cache[key]

    results: Dict[str, List[Dict[str, Any]]] = {}
    for category in categories:
        entries = payload.get(category)
        if not isinstance(entries, list) or len(entries) != 4:
            raise ValueError(f"Incomplete {category} looks")
        formatted: List[Dict[str, Any]] = []
        seen: Set[Tuple[str, str]] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError(f"Invalid entry in {category}")
            title = str(entry.get("title", "")).strip()
            description = str(entry.get("description", "")).strip()
            weather_note = str(entry.get("weather_note", "")).strip()
            shopping_keywords = str(entry.get("shopping_keywords", "")).strip()
            if not (title and description and shopping_keywords and weather_note):
                raise ValueError(f"Missing fields in {category} look")
            tags_raw = entry.get("style_tags")
            style_tags = []
            if isinstance(tags_raw, list):
                style_tags = [
                    str(tag).strip()
                    for tag in tags_raw
                    if isinstance(tag, str) and str(tag).strip()
                ]
            price_raw = entry.get("price_in_inr")
            price_value: int | None = None
            if isinstance(price_raw, (int, float)):
                price_value = int(price_raw)
            elif isinstance(price_raw, str):
                digits_only = re.sub(r"[^\d.]", "", price_raw)
                if digits_only:
                    try:
                        price_value = int(float(digits_only))
                    except ValueError:
                        price_value = None
            if price_value is None:
                raise ValueError(f"Missing price for {category} look '{title}'")
            if budget and budget > 0 and price_value > budget:
                raise ValueError(f"Look '{title}' exceeds budget in {category}")
            shopping_url = (
                f"https://www.google.com/search?q={shopping_keywords.replace(' ', '+')}"
                if shopping_keywords else None
            )
            query_terms = [shopping_keywords or title, city, category, "travel outfit"]
            query = " ".join(term for term in query_terms if isinstance(term, str) and term).strip()
            images = _fetch_images(query)
            hero = next((img for img in images if img.get("link")), None)
            if not hero or not hero.get("link"):
                raise ValueError(f"No imagery for {category} look '{title}'")
            entry_key = (title.lower(), shopping_keywords.lower())
            if entry_key in seen:
                raise ValueError(f"Duplicate look detected in {category}")
            seen.add(entry_key)
            formatted.append(
                {
                    "title": title,
                    "description": description,
                    "style_tags": style_tags,
                    "shopping_keywords": shopping_keywords,
                    "shopping_url": shopping_url,
                    "price_in_inr": price_value,
                    "weather_note": weather_note,
                    "image_url": hero.get("link"),
                    "image_thumbnail": hero.get("thumbnail"),
                    "image_context": hero.get("context"),
                }
            )
        if len(formatted) != 4:
            raise ValueError(f"Incomplete {category} looks")
        results[category] = formatted
    return results

def build_prompt(prefs: TripPreferences, day_count: int) -> str:
    t = ", ".join(prefs.themes)
    return (
        f"Trip in {prefs.destination}, India for {prefs.travellers} travellers. "
        f"Dates {prefs.startDate} to {prefs.endDate}. "
        f"Budget {prefs.budget} INR. "
        f"Themes {t or 'General'}. "
        f"Language {prefs.language or 'English'}."
    )

def extract_json_object(raw_text: str) -> str:
    if not raw_text:
        raise ValueError("Empty response from model")
    text = raw_text.strip()
    open("logs/raw_llm.jsonl", "a", encoding="utf-8").write(json.dumps({"ts": datetime.utcnow().isoformat(), "text": raw_text}, ensure_ascii=False) + "\n")
    print(text)
    try:
        if text.startswith('```'):
            text = re.sub(r'^```(?:json)?', '', text, flags=re.IGNORECASE).strip()
            text = re.sub(r'```$', '', text).strip()
        start = text.find('{')
        if start == -1:
            raise ValueError("No JSON object found in response")
        depth = 0
        in_string = False
        escape = False
        for index in range(start, len(text)):
            char = text[index]
            if char == '"' and not escape:
                in_string = not in_string
            if in_string and char == '\\' and not escape:
                escape = True
                continue
            escape = False
            if in_string:
                continue
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    return text[start:index + 1]
        raise ValueError("Incomplete JSON object in response")
    except Exception:
        traceback.print_exc()
        raise

@app.get(f"{API_PREFIX}/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

def _text_and_first_image_from_stream(stream) -> tuple[str, bytes | None]:
    texts = []
    img_bytes = None
    for chunk in stream:
        if getattr(chunk, "text", None):
            texts.append(chunk.text)
        if getattr(chunk, "candidates", None):
            for part in getattr(chunk.candidates[0].content, "parts", []):
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None) and img_bytes is None:
                    img_bytes = inline.data
    return ("".join(texts), img_bytes)

@app.post(f"{API_PREFIX}/itinerary")
def generate_live_itinerary(request: ItineraryRequest = Body(...)):
    prefs = request.preferences
    itinerary = None
    meta = {}
    try:
        day_count = _days_between_inclusive(prefs.startDate, prefs.endDate)
        base_instruction = _system_instruction(prefs, day_count)
        strict_instruction = (
            base_instruction
            + " Every day MUST contain 3-4 activities and each activity MUST include title, description, location, cost (integer or descriptive string), and source."
        )
        resp_schema = _response_schema(day_count)
        token_cap = 20000
        last_error: str | None = None

        for attempt in range(MAX_GEMINI_ATTEMPTS):
            instruction = base_instruction if attempt == 0 else strict_instruction
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[types.Content(role="user", parts=[types.Part.from_text(text=build_prompt(prefs, day_count))])],
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    temperature=0.4,
                    top_p=0.8,
                    max_output_tokens=token_cap,
                    response_mime_type="application/json",
                    response_schema=resp_schema,
                    safety_settings=[
                        types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                    ],
                ),
            )
            raw_text = getattr(response, "text", None)
            if not raw_text and getattr(response, "candidates", None):
                raw_chunks = []
                for candidate in response.candidates:
                    for part in getattr(candidate.content, "parts", []):
                        if hasattr(part, "text") and part.text:
                            raw_chunks.append(part.text)
                raw_text = "".join(raw_chunks)
            if not raw_text:
                last_error = "Gemini returned an empty response"
                continue
            try:
                itinerary = json.loads(raw_text)
            except Exception:
                try:
                    cleaned_text = extract_json_object(raw_text)
                except Exception as e:
                    last_error = f"Parse failure on attempt {attempt + 1}: {e}"
                    continue
                try:
                    itinerary = json.loads(cleaned_text)
                except Exception as e:
                    last_error = f"JSON load failure on attempt {attempt + 1}: {e}"
                    continue
            itinerary["destination"] = f"{prefs.destination}, India"
            itinerary["budget"] = prefs.budget
            itinerary["currency"] = "INR"
            itinerary["createdAt"] = datetime.utcnow().isoformat()
            break

        if itinerary is None:
            raise ValueError(last_error or "Failed to generate a complete itinerary")

        _normalize_itinerary(itinerary, prefs)
        _attach_activity_images(itinerary)
    except Exception as exc:
        traceback.print_exc()
        logger.error("Gemini itinerary generation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))

    meta = {"source": "gemini", "mode": "structured"}
    try:
        from .city_images import CITY_IMAGES
        itinerary["image_urls"] = CITY_IMAGES.get(prefs.destination, [])
    except Exception as e:
        logger.error(f"Failed to get city images: {e}")
    itinerary["themes"] = prefs.themes
    try:
        itinerary["narrations"] = generate_day_narrations(itinerary, prefs)
    except Exception as exc:
        logger.warning("Failed to generate narrations: %s", exc, exc_info=True)
    try:
        itinerary["insights"] = compute_trip_insights(itinerary, prefs)
    except Exception as exc:
        logger.warning("Failed to compute insights: %s", exc, exc_info=True)
    itinerary["meta"] = meta
    _persist_itinerary(itinerary, prefs)
    return JSONResponse(itinerary)


def _persist_itinerary(
    itinerary: dict[str, Any],
    prefs: TripPreferences | None = None,
) -> str:
    itinerary_id = itinerary.get("id") or uuid4().hex
    itinerary["id"] = itinerary_id
    payload = {
        "itinerary": itinerary,
        "preferences": prefs.model_dump() if prefs else None,
        "updatedAt": datetime.utcnow().isoformat(),
    }
    save_itinerary(itinerary_id, payload)
    return itinerary_id

@app.get(f"{API_PREFIX}/suggest-hotels")
def suggest_hotels(city: str, start_date: str, end_date: str, budget: int = 0, travellers: int = 2, itinerary_id: str | None = None):
    try:
        try:
            nights = (datetime.fromisoformat(end_date) - datetime.fromisoformat(start_date)).days
            nights = nights if nights > 0 else 1
        except Exception:
            nights = 1
        nightly_cap = float(budget) / nights if budget else None
        schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "neighbourhood": {"type": "STRING", "nullable": True},
                    "approx_price_in_inr": {"type": "NUMBER"},
                    "rating": {"type": "NUMBER", "nullable": True},
                    "url": {"type": "STRING", "nullable": True},
                    "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "confidence": {"type": "NUMBER"}
                },
                "required": ["name", "approx_price_in_inr", "confidence"]
            },
            "maxItems": 6
        }
        base_prompt = (
            f"List 4-6 real hotels in {city}, India for {travellers} travellers, "
            f"check-in {start_date} checkout {end_date}. Provide short JSON with fields name, neighbourhood, "
            f"approx_price_in_inr (integer), rating (0-5), tags, url, confidence (0-1). "
        )
        budget_clause = (
            f"Keep nightly rates at or under INR {int(nightly_cap)} whenever possible."
            if nightly_cap
            else "Stay within mid-range, budget-friendly price points suitable for the itinerary."
        )
        prompt = base_prompt + budget_clause
        resp = client.models.generate_content(
            model=MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                response_schema=schema,
                temperature=0.4,
                top_p=0.8,
                max_output_tokens=2048
            )
        )
        raw = getattr(resp, "text", "[]")
        import json as _json
        try:
            data = _json.loads(raw)
        except Exception:
            cleaned = extract_json_object(raw)
            data = _json.loads(cleaned) if cleaned else []
        filtered: List[Dict[str, Any]] = []
        for item in data:
            name = item.get("name")
            if not isinstance(name, str) or not name:
                continue
            price = item.get("approx_price_in_inr")
            try:
                price_value = float(price)
            except (TypeError, ValueError):
                price_value = None
            if nightly_cap and price_value and price_value > nightly_cap:
                continue
            query = f"{name} {city} hotel"
            try:
                images = search_images(query, num=3)
            except HTTPException:
                images = []
            if images:
                for image in images:
                    link = image.get("link")
                    if link:
                        item["image_url"] = link
                        item["image_thumbnail"] = image.get("thumbnail")
                        item["image_context"] = image.get("context")
                        break
            filtered.append(item)
        if not filtered and data:
            filtered = sorted(data, key=lambda x: x.get("approx_price_in_inr") or float("inf"))[:4]
        payload = {
            "city": city,
            "start": start_date,
            "end": end_date,
            "travellers": travellers,
            "budget": budget,
            "results": filtered,
            "generatedAt": datetime.utcnow().isoformat(),
        }
        if itinerary_id:
            try:
                from .storage import update_itinerary_fields
            except Exception:
                from storage import update_itinerary_fields  # type: ignore
            update_itinerary_fields(itinerary_id, {"providers": {"hotels": payload}})
        return JSONResponse(payload)
    except Exception as exc:
        logger.error("Hotel suggestion failed: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=500)


@app.get(f"{API_PREFIX}/suggest-flights")
def suggest_flights(
    origin: str,
    destination: str,
    depart: str,
    ret: str | None = None,
    travellers: int = 1,
    itinerary_id: str | None = None,
    budget: int | None = None,
):
    try:
        flight_schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "airline": {"type": "STRING"},
                    "flight_number": {"type": "STRING", "nullable": True},
                    "depart_time": {"type": "STRING"},
                    "arrival_time": {"type": "STRING"},
                    "duration": {"type": "STRING"},
                    "stops": {"type": "STRING"},
                    "price_in_inr": {"type": "NUMBER"},
                    "booking_url": {"type": "STRING", "nullable": True},
                    "notes": {"type": "STRING", "nullable": True},
                },
                "required": ["airline", "depart_time", "arrival_time", "duration", "price_in_inr"],
            },
            "maxItems": 5,
        }
        budget_clause = (
            f"Total fare for all {travellers} travellers must be at or below INR {budget}."
            if budget and budget > 0
            else "Keep fares budget-friendly."
        )
        ret_text = f"return on {ret}" if ret else "one-way"
        prompt = (
            f"List 3-4 real flight options from {origin} to {destination} departing {depart} ({ret_text}). "
            f"Include airline, flight_number, depart_time (local), arrival_time (local), duration, stops summary, "
            f"price_in_inr (total for {travellers} travellers), booking_url, notes. "
            f"{budget_clause} Prefer reputable carriers and sensible layovers under 3 hours."
        )
        resp = client.models.generate_content(
            model=MODEL_NAME,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                response_schema=flight_schema,
                temperature=0.4,
                top_p=0.8,
                max_output_tokens=2048,
            ),
        )
        raw = getattr(resp, "text", "[]")
        import json as _json

        try:
            data = _json.loads(raw)
        except Exception:
            cleaned = extract_json_object(raw)
            data = _json.loads(cleaned) if cleaned else []

        filtered: List[Dict[str, Any]] = []
        for option in data or []:
            if not isinstance(option, dict):
                continue
            try:
                price_value = float(option.get("price_in_inr"))
            except (TypeError, ValueError):
                price_value = None
            if budget and budget > 0 and price_value and price_value > budget:
                continue
            filtered.append(option)

        if not filtered and data:
            filtered = data[:3]

        payload = {
            "origin": origin,
            "destination": destination,
            "depart": depart,
            "return": ret,
            "travellers": travellers,
            "budget": budget,
            "results": filtered,
            "generatedAt": datetime.utcnow().isoformat(),
        }
        if itinerary_id:
            try:
                from .storage import update_itinerary_fields
            except Exception:
                from storage import update_itinerary_fields  # type: ignore
            update_itinerary_fields(itinerary_id, {"providers": {"flights": payload}})
        return JSONResponse(payload)
    except Exception as exc:
        logger.error("Flight search failed: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=500)


@app.get(f"{API_PREFIX}/suggest-fashion")
def suggest_fashion(
    city: str,
    season_hint: str | None = None,
    itinerary_id: str | None = None,
    budget: int | None = None,
):
    try:
        schema = {
            "type": "OBJECT",
            "properties": {
                "men": _fashion_array_schema(),
                "women": _fashion_array_schema(),
                "kids": _fashion_array_schema(),
                "accessories": _fashion_array_schema(),
            },
            "required": ["men", "women", "kids", "accessories"],
        }
        hint_text = f"Season hint: {season_hint}." if season_hint else ""
        budget_text = (
            f"Ensure each recommendation keeps the primary item cost at or below INR {budget}."
            if budget and budget > 0
            else "Stay budget-conscious with mid-range pricing."
        )
        prompt = (
            f"You are a fashion concierge for {city}, India. "
            "Produce JSON with four keys (men, women, kids, accessories). "
            "Each key must contain exactly four suggestions with fields title, description, weather_note, style_tags, shopping_keywords, price_in_inr. "
            "Use clearly gendered looks for men versus women, family-friendly picks for kids, and luggage/gear for accessories. "
            "For kids, focus on age-flexible options suitable for families. "
            "For accessories, include items like bags, scarves, tech essentials, or travel add-ons. "
            "Keep descriptions concise, practical for travel, and note any weather considerations. "
            f"{hint_text} {budget_text}"
        )
        strict_prompt = (
            prompt
            + " Output MUST be valid JSON only. No comments or prose. Ensure each array has exactly four items."
        )
        max_attempts = 3
        last_error: str | None = None
        suggestions: Dict[str, List[Dict[str, Any]]] | None = None

        for attempt in range(max_attempts):
            instruction_prompt = prompt if attempt == 0 else strict_prompt
            resp = client.models.generate_content(
                model=MODEL_NAME,
                contents=[types.Content(role="user", parts=[types.Part.from_text(text=instruction_prompt)])],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    response_schema=schema,
                    temperature=0.4,
                    top_p=0.8,
                    max_output_tokens=8192,
                ),
            )
            raw = getattr(resp, "text", "{}")
            import json as _json

            try:
                data = _json.loads(raw)
            except Exception:
                try:
                    cleaned = extract_json_object(raw)
                except Exception as parse_exc:
                    last_error = f"Fashion JSON parse failure: {parse_exc}"
                    continue
                data = _json.loads(cleaned) if cleaned else {}
            if not _is_valid_fashion_payload(data):
                last_error = "Gemini fashion payload missing required structure or counts"
                continue
            try:
                suggestions = _prepare_fashion_results(city, budget, data)
                break
            except ValueError as exc:
                last_error = str(exc)
                continue

        if suggestions is None:
            raise HTTPException(status_code=502, detail=last_error or "Failed to generate fashion recommendations")

        payload = {
            "city": city,
            "season_hint": season_hint,
            "results": suggestions,
            "generatedAt": datetime.utcnow().isoformat(),
            "budget": budget,
        }
        if itinerary_id:
            try:
                from .storage import update_itinerary_fields
            except Exception:
                from storage import update_itinerary_fields  # type: ignore
            update_itinerary_fields(itinerary_id, {"providers": {"fashion": payload}})
        return JSONResponse(payload)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as exc:
        logger.error("Fashion suggestion failed: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=500)
