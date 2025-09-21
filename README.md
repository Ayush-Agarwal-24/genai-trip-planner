# AI-Powered Trip Planner

This is a web application that helps you plan your trips with the power of AI. It generates personalized itineraries, provides weather forecasts, and creates a visual mood board for your destination. This project was initially developed as a hackathon prototype.

## Features

*   **Personalized Itinerary Generation:** Get a custom-tailored itinerary based on your destination and preferences.
*   **Interactive Map View:** Visualize your trip on a map.
*   **Weather Forecast:** Get the latest weather information for your destination.
*   **Image Mood Board:** Get a visual feel for your destination with an AI-generated image mood board.
*   **Live Data Toggle:** Switch between using mock data and live data from Google's Gemini AI.

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
    - `MAPS_API_KEY`: Your Google Maps API key.

3.  **Set up the Frontend:**
    ```bash
    cd app
    npm install
    npm run dev
    ```
    The frontend will be available at `http://localhost:5173` (or another port if 5173 is in use).

4.  **Set up the Backend:**
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

## Project Structure

The project is organized into two main parts:

*   `app/`: Contains the frontend React application.
*   `api/`: Contains the backend FastAPI application.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
