from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

# Top Indian cities and 3 sample Unsplash images each (replace with your own if needed)
CITY_IMAGES = {
    "Delhi, India": [
        "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=800&q=80"
    ],
    "Mumbai, India": [
        "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=800&q=80"
    ],
    "Bangalore, India": [
        "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1465101178521-c1a9136a3b41?auto=format&fit=crop&w=800&q=80"
    ],
    "Jaipur, India": [
        "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80"
    ],
    "Goa, India": [
        "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80"
    ]
}

router = APIRouter()

@router.get("/api/v1/city-images")
def get_city_images(city: str = Query(..., description="Destination city")):
    images = CITY_IMAGES.get(city)
    if not images:
        return JSONResponse({"error": f"No images found for city '{city}'"}, status_code=404)
    return JSONResponse({"city": city, "images": images})
