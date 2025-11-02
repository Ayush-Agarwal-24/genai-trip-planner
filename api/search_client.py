import os
from typing import Any, Dict, List

import httpx
from fastapi import HTTPException


BASE_URL = "https://www.googleapis.com/customsearch/v1"
API_KEY = os.getenv("GOOGLE_CUSTOM_SEARCH_KEY")
CX = os.getenv("GOOGLE_CUSTOM_SEARCH_CX")


def _ensure_credentials() -> None:
    if not API_KEY or not CX:
        raise HTTPException(
            status_code=500,
            detail="Programmable Search API is not configured. Set GOOGLE_CUSTOM_SEARCH_KEY and GOOGLE_CUSTOM_SEARCH_CX.",
        )


def _execute_request(params: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_credentials()
    request_params = {
        "key": API_KEY,
        "cx": CX,
        "safe": "active",
        **params,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(BASE_URL, params=request_params)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    data = response.json()
    return data


def parse_image_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for item in items:
        image_info = item.get("image") or {}
        results.append(
            {
                "title": item.get("title"),
                "link": item.get("link"),
                "thumbnail": image_info.get("thumbnailLink"),
                "context": image_info.get("contextLink"),
                "width": image_info.get("width"),
                "height": image_info.get("height"),
                "displayLink": item.get("displayLink"),
            }
        )
    return results


def parse_web_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for item in items:
        results.append(
            {
                "title": item.get("title"),
                "snippet": item.get("snippet"),
                "link": item.get("link"),
                "displayLink": item.get("displayLink"),
            }
        )
    return results


def search_images(query: str, num: int = 6) -> List[Dict[str, Any]]:
    data = _execute_request(
        {
            "q": query,
            "searchType": "image",
            "imgType": "photo",
            "num": min(max(num, 1), 10),
        }
    )
    return parse_image_items(data.get("items") or [])


def search_web(query: str, num: int = 5) -> List[Dict[str, Any]]:
    data = _execute_request(
        {
            "q": query,
            "num": min(max(num, 1), 10),
        }
    )
    return parse_web_items(data.get("items") or [])
