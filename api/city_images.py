from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from search_client import search_images


router = APIRouter()

API_PREFIX = "/api/v1"
@router.get(f"{API_PREFIX}/city-images")
def get_city_images(city: str = Query(..., description="Destination city"), num: int = Query(6, ge=1, le=10)):
    query = f"{city} travel photography"
    images = search_images(query, num=num)
    if not images:
        raise HTTPException(status_code=404, detail=f"No images found for '{city}'.")
    return JSONResponse(
        {
            "city": city,
            "images": [img.get("link") for img in images],
            "results": images,
        }
    )
