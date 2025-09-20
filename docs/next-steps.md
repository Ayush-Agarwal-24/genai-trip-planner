# Next Actions Checklist

## Engineering (Tonight)
- [ ] Wire frontend API base URL to `.env` value and handle CORS.
- [ ] Implement itinerary POST in FastAPI with Gemini call (use cache fallback).
- [ ] Add `/bookings` endpoint that writes to Firestore when live key provided; stub to JSON locally.
- [ ] Integrate Places API client with quota-aware caching layer under `data/places_cache/`.

## Data & AI
- [ ] Finalize prompt in `prompts/itinerary.md`; capture sample responses in `data/cached_itineraries/`.
- [ ] Define evaluation rubric + success metrics for itinerary quality.

## Product & Demo
- [ ] Populate `docs/deck-outline.md` with slide bullets (problem, users, solution, architecture, roadmap).
- [ ] Draft 3-minute video script (hook, demo, how it works, impact) under `docs/video-script.md`.
- [ ] Capture screenshots/gifs once UI solid.

## Compliance & Cost Controls
- [ ] Store `MAPS_API_KEY` in Secret Manager before Cloud Run deploy.
- [ ] Set `ENABLE_LIVE_SERVICES=false` default in Cloud Run.
- [ ] Document kill-switch process in README.
