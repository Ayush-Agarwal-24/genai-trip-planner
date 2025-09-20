# Personalized Trip Planner with AI (Hackathon Prototype)

This repo tracks the hackathon MVP build. Frontend lives in `app/` (React + Vite), API in `api/` (FastAPI). `prompts/` stores Gemini prompt drafts, `docs/` houses deck + video artefacts.

## Quickstart (local)
1. Copy `.env.example` to `.env` and populate:
   - `GCP_PROJECT_ID`
   - `GCP_LOCATION`
   - `MAPS_API_KEY`
   - optional toggles: `ENABLE_LIVE_SERVICES`, `GEMINI_MODEL`, `CORS_ALLOW_ORIGINS`
2. Frontend
   ```bash
   cd app
   npm install
   npm run dev
   ```
3. API
   ```bash
   cd api
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt  # rerun if requirements change
   uvicorn main:app --reload --port 8000
   ```

## Enabling live Gemini runs
- Live mode is opt-in. Set `ENABLE_LIVE_SERVICES=true` in `.env` (or export before running uvicorn) and toggle "Enable live data" in the UI.
- Ensure `gcloud auth application-default login` has been run for the same `GCP_PROJECT_ID`; the API uses Application Default Credentials.
- `GEMINI_MODEL` defaults to `gemini-1.5-flash`. Adjust if you prefer another model available in your region.
- When Gemini fails or quota is hit, the API returns a structured error payload so the UI can show a retry message.

## Cost guardrails
- Default behaviour returns an error payload unless you enable live mode, keeping Gemini calls deliberate.
- Live Gemini + Places calls happen only when both the backend flag and UI toggle are enabled.
- Logs clearly indicate when live calls execute; stop the run or switch off the toggle to stay within free tiers.

## Deliverables checklist
- [ ] Frontend itinerary flow (mock + live toggle)
- [ ] API endpoint hitting Gemini (graceful error payload)
- [ ] Firestore persistence & BigQuery logging (optional)
- [ ] Deck + video script in `docs/`
- [ ] Deployment (Cloud Run) scripted in `infra/`

> Track open tasks in `docs/todo.md` for daily standups.
