import os
from typing import Any, Optional

from google.cloud import firestore

_client: Optional[firestore.Client] = None
_collection_path = os.getenv("FIRESTORE_COLLECTION", "itineraries")


def _get_client() -> firestore.Client:
    global _client
    if _client is None:
        _client = firestore.Client()
    return _client


def _collection() -> firestore.CollectionReference:
    return _get_client().collection(_collection_path)


def save_itinerary(doc_id: str, payload: dict[str, Any]) -> None:
    _collection().document(doc_id).set(payload)


def load_itinerary(doc_id: str) -> dict[str, Any] | None:
    snapshot = _collection().document(doc_id).get()
    if snapshot.exists:
        data = snapshot.to_dict() or {}
        data["id"] = doc_id
        return data
    return None


def delete_itinerary(doc_id: str) -> None:
    _collection().document(doc_id).delete()


def update_itinerary_fields(doc_id: str, data: dict):
    _collection().document(doc_id).set(data, merge=True)


def save_city_image(city: str, payload: dict):
    _get_client().collection('city_images').document(city.lower()).set(payload)


def load_city_image(city: str):
    snap = _get_client().collection('city_images').document(city.lower()).get()
    return snap.to_dict() if snap.exists else None
