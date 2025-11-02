from typing import Any, Dict, List

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import JSONResponse

try:
    from .search_client import search_images  # type: ignore
except ImportError:
    from search_client import search_images  # type: ignore


router = APIRouter()


def _first_image_or_404(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not results:
        raise HTTPException(status_code=404, detail="No images found for the requested query.")
    return results[0]


@router.get("/api/v1/image-search")
def image_search(query: str = Query(..., description="Search query"), num: int = Query(6, ge=1, le=10)):
    images = search_images(query, num=num)
    return JSONResponse({"query": query, "images": images})


@router.get("/api/v1/city-hero")
def city_hero(city: str = Query(..., description="Destination city"), force: bool = False):
    """
    Return a hero-style image for the destination city using Google Programmable Search.
    """
    query = f"{city} skyline travel photo"
    image = _first_image_or_404(search_images(query, num=1))
    payload = {
        "image_url": image.get("link"),
        "thumbnail_url": image.get("thumbnail"),
        "context": image.get("context"),
        "title": image.get("title"),
        "width": image.get("width"),
        "height": image.get("height"),
        "city": city,
        "cached": False,
    }
    return JSONResponse(payload)


@router.post("/api/v1/itinerary-images")
def itinerary_images(request: Dict[str, Any] = Body(...)):
    city = request.get("city")
    places = request.get("places") or []
    max_places = request.get("max_places") or request.get("max_images") or 6
    images_per_place = request.get("images_per_place") or 3
    if not isinstance(places, list) or not places:
        raise HTTPException(status_code=400, detail="Provide at least one place.")
    max_places = max(1, min(int(max_places), 8))
    images_per_place = max(1, min(int(images_per_place), 5))
    results: List[Dict[str, Any]] = []
    for place in places[:max_places]:
        if not isinstance(place, str) or not place.strip():
            continue
        query_parts = [place]
        if city:
            query_parts.append(city)
        query_parts.append("travel photo")
        query = " ".join(query_parts)
        images = search_images(query, num=images_per_place)
        if images:
            results.append(
                {
                    "place": place,
                    "images": [
                        {
                            "image_url": img.get("link"),
                            "thumbnail_url": img.get("thumbnail"),
                            "title": img.get("title"),
                            "context": img.get("context"),
                            "width": img.get("width"),
                            "height": img.get("height"),
                        }
                        for img in images
                        if img.get("link")
                    ],
                }
            )
    return JSONResponse({"city": city, "results": results})
