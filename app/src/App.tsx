import { useMemo, useState } from 'react';
import { ItineraryForm } from './components/ItineraryForm';
import { ItineraryPreview } from './components/ItineraryPreview';
import { DemoItineraryOverlay } from './components/DemoItineraryOverlay';
import { PlannerOverlay } from './components/PlannerOverlay';
import { demoItinerary } from './demo/demoItinerary';

import { VoiceModeOverlay } from './components/VoiceModeOverlay';
import { ItineraryOverlay } from './components/ItineraryOverlay';
import './styles/global.css';

type RequestState = 'idle' | 'loading' | 'success' | 'error';
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.API_BASE_URL as string | undefined) ??
  'http://localhost:8000';

export type ItineraryMeta = {
  source?: string;
  error?: string;
  finishReason?: string;
  attempts?: number;
  usedTemplateFallback?: boolean;
  [key: string]: unknown;
};

export type TripPreferences = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  themes: string[];
  travellers: number;
  language: string;
  enableLiveData: boolean;
};

export type ItineraryDay = {
  dateLabel: string;
  summary: string;
  activities: Array<{
    time: string;
    title: string;
    description: string;
    cost: number;
    location: string;
    source: 'mock' | 'places-api' | 'ai';
  }>;
  accommodation?: {
    name: string;
    cost: number;
    notes: string;
  };
};

export type Itinerary = {
  id?: string;
  createdAt: string;
  destination: string;
  budget: number;
  totalEstimatedCost: number;
  currency: string;
  days: ItineraryDay[];
  costBreakdown: Array<{
    category: string;
    amount: number;
    notes?: string;
  }>;
  weatherAdvisory?: string;
  meta?: ItineraryMeta;
  image_url?: string;
  image_urls?: string[];
};

const seedItinerary: Itinerary = {
  id: 'seed-itinerary',
  createdAt: new Date().toISOString(),
  destination: 'Jaipur, India',
  budget: 25000,
  totalEstimatedCost: 22100,
  currency: 'INR',
  weatherAdvisory: 'Light showers expected on Day 2 evening. Keep a compact umbrella handy.',
  costBreakdown: [
    { category: 'Stay', amount: 9000 },
    { category: 'Local Transport', amount: 3200 },
    { category: 'Experiences', amount: 6400, notes: 'Includes Amer Fort night show tickets' },
    { category: 'Food', amount: 3500 },
  ],
  days: [
    {
      dateLabel: 'Day 1 - Heritage Trail',
      summary: 'Kick-off with Jaipur classics and curated heritage dining.',
      activities: [
        {
          time: '08:30',
          title: 'Amber Fort adaptive audio tour',
          description: 'Self-paced walkthrough with multilingual narration tuned to cultural interests.',
          cost: 1200,
          location: 'Amber Fort, Jaipur',
          source: 'mock',
        },
        {
          time: '13:00',
          title: 'Lunch at Anokhi Cafe',
          description: 'Budget-friendly organic dishes with workspace access for digital nomads.',
          cost: 900,
          location: 'Anokhi Cafe, Jaipur',
          source: 'mock',
        },
        {
          time: '16:00',
          title: 'City Palace guided walkthrough',
          description: 'Skip-the-line slots stitched from live availability feeds.',
          cost: 1800,
          location: 'City Palace, Jaipur',
          source: 'mock',
        },
      ],
      accommodation: {
        name: 'The Johri at Lal Haveli',
        cost: 4500,
        notes: 'Curated boutique stay with breakfast included.',
      },
    },
  ],
  meta: {
    source: 'seed',
  },
};

function App() {
  const [preferences, setPreferences] = useState<TripPreferences | null>(null);
  // Start with an empty shell so main does not show any demo content by default
  const emptyItinerary: Itinerary = {
    id: 'empty-itinerary',
    createdAt: new Date().toISOString(),
    destination: '',
    budget: 0,
    totalEstimatedCost: 0,
    currency: 'INR',
    days: [],
    costBreakdown: [],
    meta: { source: 'template' },
  };
  const [itinerary, setItinerary] = useState<Itinerary>(emptyItinerary);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<boolean>(false);
  const [showDemo, setShowDemo] = useState<boolean>(false);
  const [showPlanner, setShowPlanner] = useState<boolean>(false);
  const [showItinerary, setShowItinerary] = useState<boolean>(false);

  const handlePlanTrip = async (prefs: TripPreferences) => {
    setPreferences(prefs);
    setRequestState('loading');
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/itinerary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences: prefs }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate itinerary (${response.status})`);
      }

      const data: Itinerary = await response.json();
      const backendError = typeof data.meta?.error === 'string' ? data.meta.error : null;

      setItinerary(data);
      setError(backendError);
      setRequestState(backendError ? 'error' : 'success');
      if (!backendError) {
        setShowPlanner(false);
        setShowItinerary(true);
      }

      // if (!backendError) {
      //   void fetchDestinationHero(data.destination, prefs.enableLiveData);
      // } else {
      //   setHeroImage(null);
      // }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unexpected error';
      setError(message);
      setRequestState('error');
    }
  };

  const voiceAvailable = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const mediaSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const recorderSupported = typeof window.MediaRecorder !== 'undefined';
    return mediaSupported && recorderSupported;
  }, []);

  return (
    <div className="page">
      {/* Welcome hero (no scroll required to understand the app) */}
      <section className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">AI TRAVEL PLANNER</p>
          <h1 className="hero__title">Plan smarter trips with AI travel planner</h1>
          <p className="hero__subtitle">
            Turn your dates, budget, and interests into a ready-to-go itinerary & complete with
            photos, weather, and local tips.
          </p>
          <div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const el = document.getElementById('actions');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      </section>
      {/* Action bar (menu style) */}

      {/* Info band */}
      
      {/* Planner and preview render in overlays only. */}
      <section className="panel panel--preview">
        {requestState === 'loading' ? (
          <div className="preview-skeleton">
            <div className="skeleton-line" />
            <div className="skeleton-block" />
          </div>
        ) : null}

        <div className="features-grid">
          <article className="feature-card">
            <h3>Weather-aware planning</h3>
            <p>Daily forecasts shape your days. If rain hits, we swap in indoor gems automatically.</p>
            <ul>
              <li>Live outlook per day</li>
              <li>Smart indoor/outdoor shuffle</li>
              <li>Morning/afternoon comfort tips</li>
            </ul>
          </article>
          <article className="feature-card">
            <h3>Personalized to you</h3>
            <p>Pick themes like Heritage, Food, or Adventure. Set a budget and we keep you on track.</p>
            <ul>
              <li>Budget guardrails</li>
              <li>Theme-weighted days</li>
              <li>Family, Solo, Luxury presets</li>
            </ul>
          </article>
          <article className="feature-card">
            <h3>AI concierge, Ava</h3>
            <p>Talk to Ava to tweak the plan hands-free. Change days, swap activities, or ask for chill options.</p>
            <ul>
              <li>Natural voice chat</li>
              <li>Applies changes instantly</li>
              <li>Multilingual replies</li>
            </ul>
          </article>
          <article className="feature-card">
            <h3>Share & export</h3>
            <p>One-click sharing with costs and tips. Export a memory-ready plan to review anytime.</p>
            <ul>
              <li>Cost breakdown</li>
              <li>Local hacks & etiquette</li>
              <li>Lightweight PDF export</li>
            </ul>
          </article>
        </div>

        <div className="info-band">
          <div className="info-band__item"><strong>&lt;10s</strong><span>to first plan</span></div>
          <div className="info-band__item"><strong>8+</strong><span>themes supported</span></div>
          <div className="info-band__item"><strong>Multilingual</strong><span>English + Indian langs</span></div>
          <div className="info-band__item"><strong>Offline demo</strong><span>no API needed</span></div>
        </div>

        <div id="actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn btn--demo"
            title="Open a sample 3-day plan (no AI calls)"
            onClick={() => setShowDemo(true)}
          >
            Show Demo Plan
          </button>
          <button
            type="button"
            className="btn btn--ava"
            title="Start voice planning with Ava"
            onClick={() => {
              if (!voiceAvailable) {
                alert('Voice mode needs a browser with microphone support.');
                return;
              }
              setVoiceMode((prev) => !prev);
            }}
          >
            {voiceMode ? 'Ava Active' : 'Launch Ava'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            title="Open the planner to generate an itinerary"
            onClick={() => setShowPlanner(true)}
          >
            Generate Itinerary
          </button>
        </div>
      </section>
      {voiceMode ? (
        <VoiceModeOverlay
          itinerary={itinerary}
          preferences={preferences}
          disabled={requestState === 'loading'}
          onClose={() => setVoiceMode(false)}
          onApplyItinerary={setItinerary}
          onItineraryReady={() => setShowItinerary(true)}
        />
      ) : null}
      <ItineraryOverlay
        visible={showItinerary}
        onClose={() => setShowItinerary(false)}
        itinerary={itinerary}
        requestState={requestState}
        setItinerary={setItinerary}
        preferences={preferences}
        voiceMode={voiceMode}
      />
      <DemoItineraryOverlay visible={showDemo} onClose={() => setShowDemo(false)} itinerary={demoItinerary} />
      <PlannerOverlay
        visible={showPlanner}
        onClose={() => setShowPlanner(false)}
        onSubmit={handlePlanTrip}
        isSubmitting={requestState === 'loading'}
        status={requestState}
        lastError={error}
      />
    </div>
  );
}

export default App;




