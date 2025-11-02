# AI-Powered Trip Planner

This is a web application that helps you plan your trips with the power of AI. It generates personalized itineraries, provides weather forecasts, and creates a visual mood board for your destination. This project was initially developed as a hackathon prototype.

## Features

* **Travel Readiness Compass:** Gemini enriches each itinerary with a live radar across budget fit, logistics, weather resilience, sustainability and theme alignment, complete with alerts and recommended next actions.
* **Ava - Live Voice Mode:** A guided voice journey that captures trip requirements via Google Cloud Speech and produces a fresh itinerary. When the plan is ready, it auto-loads in the planner and the voice overlay closes.
* **AI Trip Preview:** Launch a cinematic, narrated walkthrough of each day; the script is auto-generated and streams through the browser speech engine for showtime.
* **Personalized Itinerary Generation:** Get a custom-tailored itinerary based on your destination and preferences.
* **Interactive Map View:** Visualize your trip on a map.
* **Weather Forecast:** Get the latest weather information for your destination.
* **Image Mood Board:** Get a visual feel for your destination with an AI-generated image mood board.
* **Live Data Toggle:** Switch between using mock data and live data from Google's Gemini AI.

### Demo Script (3 minutes)

1. Generate a live itinerary with the “Enable live data” toggle on.
2. Scroll through the **Travel Readiness Compass** to highlight insights, alerts, and sustainability nudges.
3. Open any day’s **AI Trip Preview**, play the narration, and call out the cinematic summary.
4. Launch **Ava Voice Mode** and walk through the guided questionnaire (origin, destination, dates, travellers, budget, themes). Let the live itinerary drop in when the conversation ends.
5. Wrap with smart tips + weather to demonstrate multi-source enrichment.

## New API surfaces

* `POST /api/v1/voice/session/start` – spins up a fresh voice session, returning Ava’s greeting and synthesized audio.
* `POST /api/v1/voice/session/{sessionId}/transcribe` – accepts captured microphone audio (WebM/Opus) and returns the Google Speech transcript.
* `POST /api/v1/voice/session/{sessionId}/message` – applies the conversation state machine, generates follow-up questions, and delivers the final itinerary once all details are collected.
* `POST /api/v1/itinerary` still returns the full itinerary payload on first generation and also persists it to Firestore with an `id`.

## Itinerary persistence with Firestore

  Ava persists each generated itinerary in Firestore—whether it originated from the form or the new voice journey. The primary `/api/v1/itinerary` endpoint always returns the canonical document (including its `id`), so the frontend can resume planning or share links across devices without juggling multiple sources of truth.

## Tech Stack

### Frontend

*   **Framework:** React with Vite
*   **Language:** TypeScript
*   **Styling:** CSS
*   **HTTP Client:** Axios
*   **Charting:** Chart.js with `chartjs-adapter-date-fns`
*   **Routing:** React Router

### Backend

*   **Framework:** FastAPI
*   **Language:** Python
*   **Server:** Uvicorn
*   **AI:** Google Gemini
*   **Cloud:** Google Cloud AI Platform
*   **Libraries:** httpx, pydantic, python-dotenv

## Getting Started

### Prerequisites

*   Node.js and npm
*   Python 3.8+ and pip
*   Google Cloud SDK (`gcloud`)

### Installation and Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Ayush-Agarwal-24/genai-trip-planner/
    cd GenAI
    ```

2.  **Configure Environment Variables:**
    Copy the `.env.example` file to a new file named `.env` and fill in the required values:
    ```bash
    cp .env.example .env
    ```
    You will need to provide:
    - `GCP_PROJECT_ID`: Your Google Cloud Project ID.
    - `GCP_LOCATION`: The Google Cloud region for your project (e.g., `us-central1`).
    - `MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY`: Your Google Maps Platform key (enable Maps, Places, and Weather APIs; restrict it to `weather.googleapis.com` as well as any other services you use).
    - `GOOGLE_APPLICATION_CREDENTIALS`: Path to the Firestore service-account JSON key (e.g., `api/credentials/firestore.json`).
    - `FIRESTORE_COLLECTION`: The collection name for storing itineraries (defaults to `itineraries`).

3.  **Create a Firestore service account:**
    - In Google Cloud console, go to **IAM & Admin → Service Accounts** and create an account with the `Cloud Datastore User` role.
    - Generate a JSON key, download it, and place it in `api/credentials/firestore.json` (the path you referenced above). Keep this file out of version control.

4.  **Set up the Frontend:**
    ```bash
    cd app
    npm install
    npm run dev
    ```
    The frontend will be available at `http://localhost:5173` (or another port if 5173 is in use).

5.  **Set up the Backend:**
    ```bash
    cd api
    python -m venv .venv
    source .venv/bin/activate  # On Windows, use `.venv\Scripts\activate`
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
    ```
    The API will be available at `http://localhost:8000`.

## Enabling Live AI Features

To use the live features powered by Google Gemini, you need to:

1.  **Enable the Service:** In your `.env` file, set `ENABLE_LIVE_SERVICES=true`.
2.  **Authenticate with Google Cloud:**
    ```bash
    gcloud auth application-default login
    ```
    Make sure you are authenticated with the same Google Cloud project ID you specified in your `.env` file.
3.  **Enable in the UI:** In the application's user interface, toggle the "Enable live data" switch.

### Google Weather API setup

This project now sources forecasts from the Google Maps Platform Weather API.

1. In the [Google Cloud Console](https://console.cloud.google.com/), open **APIs & Services → Library** for project `gen-ai-hackathon-472312` (or your own) and enable **Weather API**. Billing must be active on the project.
2. If your Maps key is restricted, add `weather.googleapis.com` to the allowed services.
3. Set `GOOGLE_MAPS_API_KEY` (or `MAPS_API_KEY`) in your `.env` and `.env.local` files to the same key.
4. After propagating the changes (usually a few minutes), the backend `/api/v1/weather-forecast` endpoint will automatically use the Google Weather responses.

## Project Structure

The project is organized into two main parts:

*   `app/`: Contains the frontend React application.
*   `api/`: Contains the backend FastAPI application.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Voice Mode Notes

- Requirements: Google Cloud Speech-to-Text and Text-to-Speech are used on the backend (see `api/requirements.txt`). Authenticate via `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS` to your service account JSON.
- Browser: needs microphone permission and `MediaRecorder` support (Chrome/Edge). Works on `https://` or `http://localhost` for dev.
- Behavior: when the voice session completes, the generated itinerary is applied and the planner overlay opens automatically; the voice overlay closes.
- Audio: the app prefers client-side speech synthesis when available for natural prosody, otherwise plays the backend MP3. Speech rate is tuned slightly slower for clarity.
- Barge-in: starting to speak cancels any ongoing assistant speech so you don’t wait on playback.
- Known: the flow is push-to-talk (non-streaming). A streaming upgrade can be added later if desired.

### Frontend API base URL (dev)

Create `app/.env.local` if needed and set:

```
VITE_API_BASE_URL=http://localhost:8000
```
