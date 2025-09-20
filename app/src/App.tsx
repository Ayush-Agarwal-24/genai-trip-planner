import { useCallback, useMemo, useState } from 'react';
import { ItineraryForm } from './components/ItineraryForm';
import { ItineraryPreview } from './components/ItineraryPreview';
import { LiveStatusBanner, type LiveStatusVariant } from './components/LiveStatusBanner';
import { ImageMoodBoard } from './components/ImageMoodBoard';
import './styles/global.css';

type RequestState = 'idle' | 'loading' | 'success' | 'error';
type ImageState = 'idle' | 'loading' | 'success' | 'error';

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
  image_base64?: string;
  image_url?: string;
};

const seedItinerary: Itinerary = {
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
      dateLabel: 'Day 1 – Heritage Trail',
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

async function requestDestinationImage(prompt: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Image generation failed (${response.status})`);
    }

    const payload: { image_base64?: string; image_url?: string } = await response.json();
    if (payload.image_base64) {
      return `data:image/png;base64,${payload.image_base64}`;
    }
    if (payload.image_url) {
      return payload.image_url;
    }
  } catch (error) {
    console.warn('Image generation error', error);
  }
  return null;
}

function App() {
  const [preferences, setPreferences] = useState<TripPreferences | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary>(seedItinerary);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [imageState, setImageState] = useState<ImageState>('idle');

  // const fetchDestinationHero = useCallback(async (destination: string, enabled: boolean) => {
  //   if (!enabled) {
  //     setHeroImage(null);
  //     setImageState('idle');
  //     return;
  //   }

  //   setImageState('loading');
  //   const prompt = `Cinematic travel photograph of ${destination}, India, golden hour, ultra-detailed, 16:9 ratio, vibrant colours, professional lighting`;
  //   const image = await requestDestinationImage(prompt);
  //   if (image) {
  //     setHeroImage(image);
  //     setImageState('success');
  //   } else {
  //     setHeroImage(null);
  //     setImageState('error');
  //   }
  // }, []);

  const handlePlanTrip = async (prefs: TripPreferences) => {
    setPreferences(prefs);
    setRequestState('loading');
    setError(null);
    setImageState('idle');

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
      console.log("Received itinerary data from backend:", data); // Debug log
      const backendError = typeof data.meta?.error === 'string' ? data.meta.error : null;

      setItinerary(data);
      setError(backendError);
      setRequestState(backendError ? 'error' : 'success');

      // if (!backendError) {
      //   void fetchDestinationHero(data.destination, prefs.enableLiveData);
      // } else {
      //   setHeroImage(null);
      // }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unexpected error';
      setError(message);
      setRequestState('error');
      setHeroImage(null);
      setImageState('error');
    }
  };

  const bannerVariant: LiveStatusVariant = useMemo(() => {
    if (requestState === 'error' && preferences?.enableLiveData) {
      return 'error';
    }
    if (itinerary.meta?.source === 'gemini') {
      return 'live';
    }
    if (preferences?.enableLiveData) {
      return 'template';
    }
    return 'idle';
  }, [itinerary.meta?.source, preferences?.enableLiveData, requestState]);

  const bannerMessage = useMemo(() => {
    if (error) return error;
    if (itinerary.meta?.source === 'gemini') return 'Powered by live Gemini + Maps data.';
    if (preferences?.enableLiveData) return 'Showing the graceful fallback when live mode is unavailable.';
    return 'Generate a live itinerary to see Gemini in action.';
  }, [error, itinerary.meta?.source, preferences?.enableLiveData]);

  const lastGenerated = itinerary?.createdAt ?? seedItinerary.createdAt;

  return (
    <div className="page">
      <section className="panel panel--form">
        <ItineraryForm
          onSubmit={handlePlanTrip}
          isSubmitting={requestState === 'loading'}
          status={requestState}
          lastError={error}
        />
      </section>
        <section className="panel panel--preview">
          {requestState === 'loading' ? (
            <div className="preview-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-block" />
            </div>
          ) : (
            <ItineraryPreview
              itinerary={itinerary}
              requestState={requestState}
              setItinerary={setItinerary}
            />
          )}
        </section>
    </div>
  );
}

export default App;
