import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import type { Itinerary, ItineraryDay, ItineraryMeta, TripPreferences } from '../App';
import { ImageMoodBoard, type MoodboardImage } from './ImageMoodBoard';
import { MapView } from './MapView';
import { WeatherCard } from './WeatherCard';
import { TravelCompass } from './TravelCompass';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
}
import { ImageLightbox } from './ImageLightbox';

function formatCurrency(amount: number, currency: string) {
  const safeCurrency = currency || "INR";
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: safeCurrency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type HotelSuggestion = {
  name: string;
  neighbourhood?: string | null;
  approx_price_in_inr: number;
  rating?: number | null;
  url?: string | null;
  tags?: string[];
  image_url?: string;
  image_thumbnail?: string;
  image_context?: string;
};

type FlightOption = {
  airline: string;
  flight_number?: string | null;
  depart_time: string;
  arrival_time: string;
  duration: string;
  stops?: string;
  price_in_inr: number;
  booking_url?: string | null;
  notes?: string | null;
};

type FashionAudience = 'men' | 'women' | 'kids' | 'accessories';

type FashionSuggestion = {
  title: string;
  description: string;
  style_tags?: string[];
  shopping_keywords?: string;
  shopping_url?: string;
  price_in_inr?: number;
  image_url?: string;
  image_thumbnail?: string;
  image_context?: string;
};

type FashionSuggestionMap = Record<FashionAudience, FashionSuggestion[]>;

const FASHION_CATEGORIES: FashionAudience[] = ['men', 'women', 'kids', 'accessories'];
const FASHION_LABELS: Record<FashionAudience, string> = {
  men: 'Men',
  women: 'Women',
  kids: 'Kids',
  accessories: 'Accessories',
};

const createEmptyFashionState = (): FashionSuggestionMap => ({
  men: [],
  women: [],
  kids: [],
  accessories: [],
});

type ItineraryPreviewProps = {
  itinerary: Itinerary;
  requestState: 'idle' | 'loading' | 'success' | 'error';
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary>>;
  preferences: TripPreferences | null;
  voiceMode: boolean;
};

type CompassInsights = {
  overallScore: number;
  badge: string;
  axes: Array<{
    id: string;
    label: string;
    score: number;
    status?: string;
    explanation?: string;
  }>;
  alerts?: string[];
  suggestedActions?: string[];
  generatedAt?: string;
};

type DayNarration = {
  day: string;
  script: string;
  mood?: string;
  lengthSeconds?: number;
};

const SOURCE_COPY: Record<string, string> = {
  gemini: 'Live itinerary powered by Gemini',
  seed: 'Sample itinerary preview',
  template: 'Prototype itinerary',
  'gemini-error': 'We could not fetch a live plan',
};

const SOURCE_TONE: Record<string, 'live' | 'template' | 'error'> = {
  gemini: 'live',
  seed: 'template',
  template: 'template',
  'gemini-error': 'error',
};

function countExperiences(days: ItineraryDay[] | undefined | null) {
  if (!Array.isArray(days)) {
    return 0;
  }
  return days.reduce((sum, day) => sum + (Array.isArray(day.activities) ? day.activities.length : 0), 0);
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ItineraryPreview({ itinerary, requestState, setItinerary, preferences, voiceMode }: ItineraryPreviewProps) {
  const meta: ItineraryMeta | undefined = itinerary.meta;
  const statusKey = meta?.source ?? 'template';
  const tone = SOURCE_TONE[statusKey] ?? 'template';
  const heading = SOURCE_COPY[statusKey] ?? 'Itinerary overview';
  const hasError = Boolean(meta?.error);

  // Weather state
  const [weather, setWeather] = useState<any | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Smart tips state
  const [smartTips, setSmartTips] = useState<string[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);

  // Map view state
  const [showMap, setShowMap] = useState(false);

  // Cinematic preview state
  const [previewDayIndex, setPreviewDayIndex] = useState<number | null>(null);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  const insights = (itinerary as any).insights as CompassInsights | undefined;
  const narrations = (itinerary as any).narrations as DayNarration[] | undefined;
  const safeCostBreakdown = Array.isArray(itinerary.costBreakdown) ? itinerary.costBreakdown : [];
  const safeDays = Array.isArray(itinerary.days) ? itinerary.days : [];
  const summaryHints = useMemo(
    () =>
      safeDays.map((day) =>
        (typeof day.summary === 'string' ? day.summary : '')
          .split(/[,.;]/)
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 3 && !/^day\s+\d+/i.test(segment)),
      ),
    [safeDays],
  );
  const currentNarration = useMemo<DayNarration | null>(
    () => (previewDayIndex !== null && narrations && narrations[previewDayIndex] ? narrations[previewDayIndex] : null),
    [narrations, previewDayIndex]
  );
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Moodboard imagery
  const [moodboardImages, setMoodboardImages] = useState<MoodboardImage[]>([]);
  const [activityImages, setActivityImages] = useState<Record<string, MoodboardImage[]>>({});

  // Providers: hotels, flights, fashion
  const [hotels, setHotels] = useState<HotelSuggestion[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [fashion, setFashion] = useState<FashionSuggestionMap>(() => createEmptyFashionState());
  const [activeFashionAudience, setActiveFashionAudience] = useState<FashionAudience>('men');
  const [fashionLoading, setFashionLoading] = useState(false);
  const [fashionError, setFashionError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string | null; context?: string | null } | null>(null);

  const findActivityImages = useCallback(
    (...rawCandidates: Array<string | null | undefined>) => {
      const candidates = rawCandidates.filter(
        (value): value is string => Boolean(value && value.trim()),
      );
      const collected: MoodboardImage[] = [];
      candidates.forEach((candidate) => {
        const trimmed = candidate.trim();
        if (!trimmed) {
          return;
        }
        const variations = new Set<string>();
        variations.add(trimmed.toLowerCase());
        variations.add(slugify(trimmed));
        trimmed.split(/\s+/).forEach((segment) => {
          const part = segment.trim();
          if (part.length > 3) {
            variations.add(part.toLowerCase());
            variations.add(slugify(part));
          }
        });
        variations.forEach((key) => {
          const bucket = activityImages[key];
          if (bucket) {
            bucket.forEach((img) => {
              if (!collected.some((existing) => existing.src === img.src)) {
                collected.push(img);
              }
            });
          }
        });
      });
      return collected;
    },
    [activityImages],
  );

  const stopVoiceover = useCallback(() => {
    if (supportsSpeech) {
      window.speechSynthesis.cancel();
    }
    setIsVoicePlaying(false);
  }, [supportsSpeech]);

  const handleVoiceover = useCallback(() => {
    if (!supportsSpeech || !currentNarration) return;
    stopVoiceover();
    const utterance = new SpeechSynthesisUtterance(currentNarration.script);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onend = () => setIsVoicePlaying(false);
    utterance.onerror = () => setIsVoicePlaying(false);
    setIsVoicePlaying(true);
    window.speechSynthesis.speak(utterance);
  }, [currentNarration, stopVoiceover, supportsSpeech]);

  useEffect(() => () => stopVoiceover(), [stopVoiceover]);

  const closePreview = useCallback(() => {
    stopVoiceover();
    setPreviewDayIndex(null);
  }, [stopVoiceover]);

  const handleImageError = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    target.style.display = 'none';
  }, []);

  const openLightbox = useCallback((image: { src: string; title?: string | null; place?: string | null; context?: string | null }) => {
    if (!image?.src) return;
    setLightboxImage({
      src: image.src,
      title: image.place || image.title || null,
      context: image.context || null,
    });
  }, []);

  const closeLightbox = useCallback(() => setLightboxImage(null), []);

  useEffect(() => {
    if (itinerary.destination && itinerary.meta?.source === 'gemini') {
      setTipsLoading(true);
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
      const themes = (itinerary as any).themes?.join(',') || '';
      fetch(`${API_BASE_URL}/api/v1/smart-tips?destination=${encodeURIComponent(itinerary.destination)}&themes=${encodeURIComponent(themes)}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data.tips)) {
            setSmartTips(data.tips);
          }
        })
        .finally(() => setTipsLoading(false));
    }
  }, [itinerary.destination, itinerary.meta?.source]);

  // Fetch travel imagery for key places in the itinerary (Programmable Search)
  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
    if (!itinerary?.days || itinerary.days.length === 0) {
      setMoodboardImages([]);
      setActivityImages({});
      return;
    }
    try {
      const places: string[] = [];
      for (const day of itinerary.days) {
        for (const act of day.activities || []) {
          const label = (act.location || act.title || '').trim();
          if (label && !places.includes(label)) {
            places.push(label);
          }
          if (places.length >= 8) break;
        }
        if (places.length >= 8) break;
      }
      if (places.length === 0) {
        setMoodboardImages([]);
        setActivityImages({});
        return;
      }
      const imagesPerPlace = 3;
      fetch(`${API_BASE_URL}/api/v1/itinerary-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: itinerary.destination,
          places,
          max_places: Math.min(places.length, 8),
          images_per_place: imagesPerPlace,
        }),
      })
        .then(res => res.json())
        .then(payload => {
          const entries = Array.isArray(payload?.results) ? payload.results : [];
          const moodboard: MoodboardImage[] = [];
          const association: Record<string, MoodboardImage[]> = {};

          entries.forEach((entry: any) => {
            const placeName = typeof entry?.place === 'string' ? entry.place.trim() : '';
            const normalizedPlace = placeName.toLowerCase();
            const images = Array.isArray(entry?.images) ? entry.images : [];

            const rawCandidates = images
              .map((img: any) => {
                const src = img?.image_url ?? img?.thumbnail_url;
                if (!src) return null;
                return {
                  src,
                  title: img?.title || placeName,
                  context: img?.context,
                  label: placeName,
                  place: placeName || img?.title,
                  width: typeof img?.width === 'number' ? img.width : undefined,
                  height: typeof img?.height === 'number' ? img.height : undefined,
                } as MoodboardImage;
              })
              .filter(Boolean) as MoodboardImage[];

            if (!rawCandidates.length) return;

            const placeTokens =
              placeName.length > 0
                ? placeName
                    .toLowerCase()
                    .split(/\W+/)
                    .filter((token: string) => token.length > 3)
                : [];

            const matchesContext = rawCandidates.filter((img) => {
              if (placeTokens.length === 0) return true;
              const haystack = `${img.title ?? ''} ${img.context ?? ''} ${img.place ?? ''}`.toLowerCase();
              return placeTokens.some((token: string) => haystack.includes(token));
            });

            const contextPool = matchesContext.length > 0 ? matchesContext : rawCandidates;

            const qualityPool = contextPool.filter((img) => {
              const widthOk = typeof img.width === 'number' ? img.width >= 320 : true;
              const heightOk = typeof img.height === 'number' ? img.height >= 200 : true;
              return widthOk && heightOk;
            });

            const ranking = qualityPool.length > 0 ? qualityPool : contextPool;

            const unique: MoodboardImage[] = [];
            ranking.forEach((img) => {
              if (!unique.some((existing) => existing.src === img.src)) {
                unique.push(img);
              }
            });

            const selected = unique.slice(0, imagesPerPlace);

            if (!selected.length) return;

            selected.forEach((img) => {
              if (moodboard.length < 3 && !moodboard.some((existing) => existing.src === img.src)) {
                moodboard.push(img);
              }
            });

            const keys = new Set<string>();
            const registerKey = (value: string) => {
              const trimmed = value.trim();
              if (!trimmed) return;
              const lower = trimmed.toLowerCase();
              keys.add(lower);
              const slug = slugify(trimmed);
              if (slug) {
                keys.add(slug);
              }
            };
            if (normalizedPlace) {
              registerKey(placeName);
            }
            placeName.split(',').forEach((part: string) => registerKey(part));
            placeName.split(' ').forEach((part: string) => {
              if (part.trim().length > 3) registerKey(part);
            });
            if (keys.size === 0) {
              selected.forEach((img) => {
                const basis = (img.place || img.title || '').toLowerCase();
                basis.split(/[^a-z0-9]+/).forEach((token: string) => {
                  const cleaned = token.trim();
                  if (cleaned.length > 3) {
                    keys.add(cleaned);
                  }
                });
              });
            }

            keys.forEach((key) => {
              if (!association[key]) {
                association[key] = [];
              }
              const bucket = association[key];
              selected.forEach((img) => {
                if (!bucket.some((existing) => existing.src === img.src)) {
                  bucket.push(img);
                }
              });
            });
          });

          if (moodboard.length < 3) {
            Object.values(association).forEach((group) => {
              group.forEach((img) => {
                if (moodboard.length < 3 && !moodboard.some((existing) => existing.src === img.src)) {
                  moodboard.push(img);
                }
              });
            });
          }

          setMoodboardImages(moodboard.slice(0, 3));
          setActivityImages(association);
        })
        .catch(() => {
          setMoodboardImages([]);
          setActivityImages({});
        });
    } catch {
      setMoodboardImages([]);
      setActivityImages({});
    }
  }, [itinerary.destination, itinerary.meta?.source, JSON.stringify(itinerary.days)]);

  // Fetch provider suggestions when we have itinerary + preferences
  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
    if (!preferences || !itinerary?.destination) return;
    // Hotels
    setHotelsLoading(true);
    const qHotels = new URLSearchParams({
      city: itinerary.destination,
      start_date: preferences.startDate,
      end_date: preferences.endDate,
      travellers: String(preferences.travellers ?? 1),
      budget: String(itinerary.budget ?? 0),
    });
    if ((itinerary as any).id) qHotels.set('itinerary_id', String((itinerary as any).id));
    fetch(`${API_BASE_URL}/api/v1/suggest-hotels?${qHotels.toString()}`)
      .then(r => r.json())
      .then(p => {
        const list = Array.isArray(p?.results) ? p.results : [];
          const cleaned = list
            .filter((item: any) => typeof item?.name === 'string')
            .map((item: any) => ({
              name: item.name,
              neighbourhood: item.neighbourhood ?? null,
              approx_price_in_inr:
                typeof item.approx_price_in_inr === 'number'
                  ? item.approx_price_in_inr
                  : Number(item.approx_price_in_inr) || 0,
              rating: typeof item.rating === 'number' ? item.rating : null,
              url: item.url ?? null,
              tags: Array.isArray(item.tags) ? item.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : undefined,
              image_url: typeof item.image_url === 'string' ? item.image_url : undefined,
              image_thumbnail: typeof item.image_thumbnail === 'string' ? item.image_thumbnail : undefined,
            image_context: typeof item.image_context === 'string' ? item.image_context : undefined,
          })) as HotelSuggestion[];
          cleaned.sort((a, b) => (a.approx_price_in_inr ?? Number.MAX_VALUE) - (b.approx_price_in_inr ?? Number.MAX_VALUE));
          setHotels(cleaned.slice(0, 6));
      })
      .catch(() => setHotels([]))
      .finally(() => setHotelsLoading(false));

    // Flights
      if (preferences.origin && preferences.destination) {
        setFlightsLoading(true);
        const qFlights = new URLSearchParams({
          origin: preferences.origin,
          destination: preferences.destination,
          depart: preferences.startDate,
          travellers: String(preferences.travellers ?? 1),
          budget: String(itinerary.budget ?? 0),
        });
        if (preferences.endDate) qFlights.set('ret', preferences.endDate);
        if ((itinerary as any).id) qFlights.set('itinerary_id', String((itinerary as any).id));
        fetch(`${API_BASE_URL}/api/v1/suggest-flights?${qFlights.toString()}`)
          .then(r => r.json())
          .then(p => {
            const list = Array.isArray(p?.results) ? p.results : [];
            const cleaned = list
              .filter((item: any) => typeof item?.airline === 'string')
              .map((item: any) => ({
                airline: item.airline,
                flight_number: item.flight_number ?? null,
                depart_time: item.depart_time,
                arrival_time: item.arrival_time,
                duration: item.duration,
                stops: item.stops,
                price_in_inr:
                  typeof item.price_in_inr === 'number'
                    ? item.price_in_inr
                    : Number(item.price_in_inr) || 0,
                booking_url: item.booking_url ?? null,
                notes: item.notes ?? null,
              })) as FlightOption[];
            cleaned.sort((a, b) => (a.price_in_inr || Number.MAX_VALUE) - (b.price_in_inr || Number.MAX_VALUE));
            setFlights(cleaned.slice(0, 5));
          })
          .catch(() => setFlights([]))
          .finally(() => setFlightsLoading(false));
      }

    // Fashion
    setFashionLoading(true);
    setFashionError(null);
    const month = (() => { try { return new Date(preferences.startDate).toLocaleString('en-US', { month: 'long' }); } catch { return ''; } })();
    const qFashion = new URLSearchParams({ city: preferences.destination || itinerary.destination });
    if (month) qFashion.set('season_hint', month);
    qFashion.set('budget', String(itinerary.budget ?? 0));
    if ((itinerary as any).id) qFashion.set('itinerary_id', String((itinerary as any).id));
    fetch(`${API_BASE_URL}/api/v1/suggest-fashion?${qFashion.toString()}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.error) {
          const message =
            typeof payload?.error === 'string'
              ? payload.error
              : `Failed to fetch fashion suggestions (${response.status})`;
          throw new Error(message);
        }
        return payload;
      })
      .then((p) => {
        const source = p?.results;
        if (!source || typeof source !== 'object') {
          throw new Error('Fashion suggestions payload was empty.');
        }
        const draft: FashionSuggestionMap = createEmptyFashionState();
        (Object.keys(draft) as FashionAudience[]).forEach((key) => {
          const entries = Array.isArray((source as Record<string, unknown>)[key])
            ? (source as Record<string, unknown>)[key]
            : [];
          const parsed = (entries as any[]).map((entry) => ({
            title: entry.title,
            description: entry.description,
            style_tags: Array.isArray(entry.style_tags)
              ? entry.style_tags.filter((tag: unknown): tag is string => typeof tag === 'string')
              : undefined,
            shopping_keywords: entry.shopping_keywords,
            shopping_url: entry.shopping_url,
            price_in_inr:
              typeof entry.price_in_inr === 'number'
                ? entry.price_in_inr
                : Number(entry.price_in_inr) || undefined,
            image_url: entry.image_url ?? entry.image_thumbnail ?? undefined,
            image_thumbnail: entry.image_thumbnail,
            image_context: entry.image_context,
          })) as FashionSuggestion[];
          draft[key] = parsed;
        });
        setFashion(draft);
        const firstWithLooks = (Object.keys(draft) as FashionAudience[]).find((key) => draft[key].length > 0);
        if (firstWithLooks) {
          setActiveFashionAudience(firstWithLooks);
        } else {
          setActiveFashionAudience('men');
        }
        setFashionError(null);
      })
      .catch((error) => {
        setFashion(createEmptyFashionState());
        setActiveFashionAudience('men');
        setFashionError(error instanceof Error ? error.message : 'Unable to load fashion suggestions right now.');
      })
      .finally(() => setFashionLoading(false));
  }, [itinerary?.destination, itinerary?.budget, (itinerary as any)?.id, preferences?.origin, preferences?.destination, preferences?.startDate, preferences?.endDate, preferences?.travellers]);

  const handleShowWeather = async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    setWeather(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
      const forecastUrl = `${API_BASE_URL}/api/v1/weather-forecast?city=${encodeURIComponent(itinerary.destination)}`;
      const response = await fetch(forecastUrl);
      const data = await response.json();
      if (!response.ok || data?.error) {
        setWeatherError(data?.error ?? `Failed to fetch weather (${response.status})`);
      } else {
        setWeather(data);
      }
    } catch (err: any) {
      setWeatherError(err?.message || "Failed to fetch weather");
    } finally {
      setWeatherLoading(false);
    }
  };

  return (
    <>
      {currentNarration && (
        <div className="preview-modal" role="dialog" aria-modal="true">
          <div className="preview-modal__backdrop" onClick={closePreview} />
          <div className="preview-modal__content">
            <button type="button" className="preview-modal__close" onClick={closePreview} aria-label="Close preview">
              X
            </button>
            <h3>{currentNarration.day}</h3>
            <p className="preview-modal__script">{currentNarration.script}</p>
            <div className="preview-modal__actions">
              {supportsSpeech && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleVoiceover}
                  disabled={isVoicePlaying}
                >
                  {isVoicePlaying ? 'Playing narration...' : 'Play AI voiceover'}
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="preview-card">
      {(tone === "template" || tone === "live") && (
        <ImageMoodBoard
          destination={itinerary.destination}
          variant={tone}
          itineraryImages={
            moodboardImages.length > 0
              ? moodboardImages
              : tone === "template" && Array.isArray((itinerary as any).image_urls)
                ? (itinerary as any).image_urls
                    .filter((src: unknown): src is string => typeof src === 'string')
                    .slice(0, 3)
                    .map((src: string) => ({ src }))
                : undefined
          }
          onImageClick={openLightbox}
        />
      )}

      {/* Suggested Hotels */}
      {requestState !== 'idle' && (
      <section className="preview-section">
        <h3>Suggested Hotels</h3>
        {hotelsLoading && hotels.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading hotel options...</p>
        ) : hotels.length > 0 ? (
          <div className="preview-card__stats">
            {hotels.slice(0, 6).map((h, idx) => (
              <div key={`${h.name}-${idx}`} className="stat-card" style={{ alignItems: 'flex-start' }}>
                {h.image_url ? (
                  <img
                    src={h.image_url}
                    alt={`${h.name} exterior`}
                    loading="lazy"
                    onError={handleImageError}
                    onClick={() =>
                      openLightbox({
                        src: h.image_url!,
                        title: h.name,
                        context: h.url ?? h.image_context ?? null,
                      })
                    }
                    style={{
                      width: '100%',
                      height: 140,
                      objectFit: 'cover',
                      borderRadius: 12,
                      marginBottom: '0.75rem',
                      cursor: 'zoom-in',
                    }}
                  />
                ) : null}
                <strong>{h.name}</strong>
                {h.neighbourhood && <span className="stat-card__label">{h.neighbourhood}</span>}
                {typeof h.rating === 'number' ? <span className="stat-card__label">Rating {h.rating.toFixed(1)}/5</span> : null}
                <span>{new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(h.approx_price_in_inr)}</span>
                {h.tags && h.tags.length > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>{h.tags.join(', ')}</div>
                )}
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noreferrer" className="preview-day-btn">Explore</a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No hotel suggestions yet.</p>
        )}
      </section>
      )}

      {/* Suggested Flights */}
      {requestState !== 'idle' && (
      <section className="preview-section">
        <h3>Suggested Flights</h3>
        {flightsLoading && flights.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading flight options...</p>
        ) : flights.length > 0 ? (
          <div className="flight-table-wrapper">
            <table className="flight-table">
              <thead>
                <tr>
                  <th>Airline</th>
                  <th>Times</th>
                  <th>Duration</th>
                  <th>Stops</th>
                  <th>Price</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {flights.slice(0, 5).map((flight, idx) => (
                  <tr key={`${flight.airline}-${idx}`}>
                    <td>
                      <strong>{flight.airline}</strong>
                      {flight.flight_number ? <div className="muted">{flight.flight_number}</div> : null}
                    </td>
                    <td>
                      <div>{flight.depart_time}</div>
                      <div className="muted">arrives {flight.arrival_time}</div>
                    </td>
                    <td>{flight.duration}</td>
                    <td>{flight.stops || 'Non-stop'}</td>
                    <td>
                      {flight.price_in_inr
                        ? formatCurrency(flight.price_in_inr, itinerary.currency)
                        : 'Quote pending'}
                    </td>
                    <td>{flight.notes || '--'}</td>
                    <td>
                      {flight.booking_url ? (
                        <a href={flight.booking_url} target="_blank" rel="noreferrer" className="preview-day-btn">
                          Book
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No flight suggestions yet.</p>
        )}
      </section>
      )}

      {/* What To Pack (Fashion) */}
      {requestState !== 'idle' && (
      <section className="preview-section">
        <h3>What To Pack</h3>
        <div className="fashion-tabs">
          {FASHION_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={classNames(
                'fashion-tabs__button',
                activeFashionAudience === category && 'fashion-tabs__button--active',
              )}
              onClick={() => setActiveFashionAudience(category)}
            >
              {FASHION_LABELS[category]}
            </button>
          ))}
        </div>
        {fashionError ? (
          <div className="error-banner">{fashionError}</div>
        ) : fashionLoading && (fashion[activeFashionAudience]?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Assembling outfits...</p>
        ) : (fashion[activeFashionAudience]?.length ?? 0) > 0 ? (
          <div className="preview-card__stats fashion-grid">
            {fashion[activeFashionAudience].slice(0, 4).map((look, idx) => (
              <div key={`${look.title}-${idx}`} className="stat-card stat-card--fashion">
                {look.image_url ? (
                  <div className="stat-card__media">
                    <img
                      src={look.image_url}
                      alt={`${look.title} inspiration`}
                      loading="lazy"
                      onError={handleImageError}
                      onClick={() =>
                        openLightbox({
                          src: look.image_url!,
                          title: look.title,
                          context: look.shopping_url ?? look.image_context ?? null,
                        })
                      }
                      style={{ cursor: 'zoom-in' }}
                    />
                  </div>
                ) : null}
                <div className="stat-card__body">
                  <strong>{look.title}</strong>
                  <span className="stat-card__label">{look.description}</span>
                  {typeof look.price_in_inr === 'number' ? (
                    <span className="stat-card__price">
                      {formatCurrency(look.price_in_inr, itinerary.currency)}
                    </span>
                  ) : null}
                  {look.style_tags && look.style_tags.length > 0 && (
                    <div className="stat-card__tags">{look.style_tags.join(', ')}</div>
                  )}
                </div>
                {look.shopping_url && (
                  <a href={look.shopping_url} target="_blank" rel="noreferrer" className="preview-day-btn">
                    Shop
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No fashion suggestions yet for this group.</p>
        )}
      </section>
      )}

      {requestState !== 'idle' && (
        <div className="preview-actions-row">
          <button className="btn btn--ghost" onClick={handleShowWeather} disabled={weatherLoading}>
            {weatherLoading ? "Loading weather..." : weather ? "Refresh Weather" : "Show Weather"}
          </button>
          <button className="btn btn--ghost" onClick={() => setShowMap(!showMap)}>
            {showMap ? "Hide Map" : "Show Map View"}
          </button>
        </div>
      )}
      {weatherError && <div className="error-banner">{weatherError}</div>}
      {weather && (
        <section className="preview-section weather-outlook">
          <h3>Weather Outlook</h3>
          {weather.current ? (
            <div className="weather-current">
              <div className="weather-current__temp">
                {typeof weather.current.temperature === 'number'
                  ? `${Math.round(weather.current.temperature)}\u00B0C`
                  : '--'}
              </div>
              <div className="weather-current__details">
                <span>{weather.current.weather || 'Current conditions'}</span>
                <span className="muted">
                  Feels like{' '}
                  {typeof weather.current.feels_like === 'number'
                    ? `${Math.round(weather.current.feels_like)}\u00B0C`
                    : '--'}
                </span>
                <span className="muted">
                  Humidity {typeof weather.current.humidity === 'number' ? `${weather.current.humidity}%` : '--'}
                </span>
                <span className="muted">
                  Wind {typeof weather.current.wind_speed === 'number' ? `${Math.round(weather.current.wind_speed)} km/h` : '--'}
                </span>
              </div>
            </div>
          ) : null}
          <div className="weather-card-grid">
            {(weather.days ?? []).slice(0, 5).map((day: any, index: number) => {
              const weatherKey =
                typeof day?.date === 'string' && day.date.trim().length > 0
                  ? day.date
                  : `forecast-${index}`;
              return <WeatherCard key={weatherKey} day={day} />;
            })}
          </div>
          {weather.warning && <div className="weather-warning">{weather.warning}</div>}
        </section>
      )}
      {showMap && <MapView itinerary={itinerary} />}
      {(tipsLoading || smartTips.length > 0) && (
        <section className="preview-section">
          <h3>Smart Tips</h3>
          {tipsLoading && smartTips.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Ava is curating local hacks...</p>
          ) : (
            <ul>
              {smartTips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      <header className="preview-card__header">
        <div>
          <span className={classNames('badge', `badge--${tone}`)}>{heading}</span>
          <h2>{itinerary.destination || 'Your itinerary will appear here'}</h2>
          <p className="preview-card__meta">
            Last generated - {new Date(itinerary.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="preview-card__stats">
          <div className="stat-card">
            <span className="stat-card__label">Budget</span>
            <strong className="stat-card__value">
              {formatCurrency(itinerary.budget, itinerary.currency)}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Estimated spend</span>
            <strong className="stat-card__value">
              {formatCurrency(itinerary.totalEstimatedCost, itinerary.currency)}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Experiences</span>
            <strong className="stat-card__value">{countExperiences(itinerary.days)}</strong>
          </div>
        </div>
      </header>
      {insights && (
        <TravelCompass insights={insights} />
      )}

      {hasError ? (
        <aside className="preview-error">
          <h3>We could not fetch a live itinerary this time</h3>
          <p>{meta?.error}</p>
          <ul>
            <li>Check your Gemini quota or billing status.</li>
            <li>Try a nearby neighbourhood or simplify the themes.</li>
            <li>Re-run with live mode toggled when you are ready.</li>
          </ul>
        </aside>
      ) : null}

      {requestState === 'loading' ? (
        <div className="preview-skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-block" />
        </div>
      ) : null}

      {Boolean(itinerary.weatherAdvisory) && !hasError ? (
        <section className="preview-weather">
          <div className="preview-weather__icon" aria-hidden="true">
            {(() => {
              const advisory = itinerary.weatherAdvisory?.toLowerCase() || '';
              if (advisory.includes('rain') || advisory.includes('shower')) return 'Rain';
              if (advisory.includes('sun') || advisory.includes('clear')) return 'Sun';
              if (advisory.includes('cloud')) return 'Clouds';
              if (advisory.includes('storm')) return 'Storm';
              if (advisory.includes('snow')) return 'Snow';
              if (advisory.includes('wind')) return 'Wind';
              return 'Weather';
            })()}
          </div>
          <p>{itinerary.weatherAdvisory}</p>
        </section>
      ) : null}

      {!hasError && safeCostBreakdown.length ? (
        <section className="preview-costs">
          <h3>Cost breakdown</h3>
          <div className="preview-costs__grid">
            {safeCostBreakdown.map((item, breakdownIndex) => {
              // Simple icon mapping for categories
              const iconMap: Record<string, string> = {
                Accommodation: "[Stay]",
                Stay: "[Stay]",
                "Food & Drinks": "[Food]",
                Food: "[Food]",
                "Activities & Entry Fees": "[Fun]",
                Experiences: "[Fun]",
                "Local Transport": "[Transit]",
                Transport: "[Transit]",
                "Shopping & Souvenirs": "[Shop]",
                Shopping: "[Shop]",
                "Buffer & Miscellaneous": "[Misc]",
                Miscellaneous: "[Misc]",
              };
              const icon = iconMap[item.category] || "[Cost]";
              return (
                <div
                  key={`${slugify(item.category || 'misc')}-${breakdownIndex}`}
                  className="cost-card"
                >
                  <span className="cost-card__icon" style={{ fontSize: "1.3rem", marginRight: "0.4em" }}>{icon}</span>
                  <span className="cost-card__label">{item.category}</span>
                  <strong className="cost-card__value">
                    {formatCurrency(item.amount, itinerary.currency)}
                  </strong>
                  {item.notes ? <p className="cost-card__notes">{item.notes}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {!hasError && safeDays.length ? (
        <section className="preview-timeline">
          <h3>Daily flow</h3>
          <ol className="timeline-modern">
            {safeDays.map((day, dayIndex) => {
              const safeLabel =
                typeof day.dateLabel === 'string' && day.dateLabel.trim().length > 0
                  ? day.dateLabel
                  : `Day ${dayIndex + 1}`;
              const dayKey = `${slugify(safeLabel)}-${dayIndex}`;
              const safeSummary =
                typeof day.summary === 'string' && day.summary.trim().length > 0
                  ? day.summary
                  : 'Tailored highlights for your trip.';
              const activities = Array.isArray(day.activities) ? day.activities : [];
              return (
                <li key={dayKey} className="timeline-modern__day">
                  <div className="timeline-modern__header">
                    <h4>{safeLabel}</h4>
                    <p>{safeSummary}</p>
                    {narrations && narrations[dayIndex] ? (
                      <button
                        type="button"
                        className="preview-day-btn"
                        onClick={() => setPreviewDayIndex(dayIndex)}
                      >
                        Launch AI trip preview
                      </button>
                    ) : null}
                  </div>
                  <ul className="timeline-modern__activities">
                    {activities.map((activity, activityIndex) => {
                      const hintSet = summaryHints[dayIndex] ?? [];
                      const hint = hintSet[activityIndex] || hintSet[hintSet.length - 1] || '';
                      const rawTime = typeof activity.time === 'string' ? activity.time.trim() : '';
                      const rawTitle = typeof activity.title === 'string' ? activity.title.trim() : '';
                      const rawDescription =
                        typeof activity.description === 'string' ? activity.description.trim() : '';
                      const rawLocation =
                        typeof activity.location === 'string' ? activity.location.trim() : '';

                      const time = rawTime.length > 0 ? rawTime : `Day ${dayIndex + 1}`;
                      const fallbackTitle =
                        rawLocation.length > 0
                          ? rawLocation
                          : hint.length > 0
                            ? hint
                            : `${itinerary.destination || 'Trip'} signature moment`;
                      const title = rawTitle.length > 0 ? rawTitle : fallbackTitle;
                      const fallbackDescription =
                        hint.length > 0
                          ? `Designed around ${hint.toLowerCase()}.`
                          : `Handpicked experience in ${itinerary.destination || 'your destination'}.`;
                      const description =
                        rawDescription.length > 0 ? rawDescription : fallbackDescription;
                      const location =
                        rawLocation.length > 0
                          ? rawLocation
                          : hint.length > 0
                            ? hint
                            : `${itinerary.destination || 'Local highlight'}`;

                      const backendImagesRaw = Array.isArray((activity as any).images)
                        ? (activity as any).images
                        : [];
                      const backendImages: MoodboardImage[] = backendImagesRaw
                        .map((img: any) => {
                          const src =
                            typeof img?.image_url === 'string'
                              ? img.image_url
                              : typeof img?.thumbnail_url === 'string'
                                ? img.thumbnail_url
                                : null;
                          if (!src) return null;
                          const contextValue =
                            typeof img?.context_url === 'string'
                              ? img.context_url
                              : typeof img?.context === 'string'
                                ? img.context
                                : undefined;
                          return {
                            src,
                            title: img?.title ?? title,
                            context: contextValue,
                            place: location,
                            width: typeof img?.width === 'number' ? img.width : undefined,
                            height: typeof img?.height === 'number' ? img.height : undefined,
                          } as MoodboardImage;
                        })
                        .filter((img): img is MoodboardImage => Boolean(img?.src));

                      const lookupImages = findActivityImages(rawLocation, rawTitle, location, title);
                      const gallery: MoodboardImage[] = [];
                      [...backendImages, ...lookupImages].forEach((img) => {
                        if (!gallery.some((existing) => existing.src === img.src)) {
                          gallery.push(img);
                        }
                      });

                      const keyBase = slugify(
                        `${dayIndex + 1}-${safeLabel}-${title}-${activityIndex}`,
                      );

                      const rawCost: unknown = (activity as any).cost;
                      let costDisplay = 'Included';
                      if (typeof rawCost === 'number' && Number.isFinite(rawCost)) {
                        costDisplay = formatCurrency(rawCost, itinerary.currency);
                      } else if (typeof rawCost === 'string' && rawCost.trim().length > 0) {
                        costDisplay = rawCost.trim();
                      }
                      return (
                        <li key={keyBase} className="timeline-modern__activity">
                          <div className="timeline-modern__activity-header">
                            <span className="timeline-modern__time">{time}</span>
                            <span className="timeline-modern__title">{title}</span>
                            <span
                              className={classNames(
                                'timeline-modern__badge',
                                activity.source !== 'mock' && 'timeline-modern__badge--live',
                              )}
                            >
                              {activity.source === 'mock' ? 'Prototype' : 'Live'}
                            </span>
                          </div>
                          {gallery.length > 0 ? (
                            <div className="timeline-modern__media timeline-modern__media--grid">
                              {gallery.slice(0, 3).map((img, galleryIndex) => (
                                <img
                                  key={`${keyBase}-${galleryIndex}`}
                                  src={img.src}
                                  alt={title}
                                  loading="lazy"
                                  onError={handleImageError}
                                  onClick={() => openLightbox(img)}
                                  style={{ cursor: 'zoom-in' }}
                                />
                              ))}
                            </div>
                          ) : null}
                          <p className="timeline-modern__description">{description}</p>
                          <footer className="timeline-modern__footer">
                            <span>{location}</span>
                            <span>{costDisplay}</span>
                          </footer>
                        </li>
                      );
                    })}
                  </ul>
                  {day.accommodation ? (
                    <div className="timeline-modern__accommodation">
                      <div>
                        <span className="timeline-modern__label">Stay</span>
                        <strong>{day.accommodation.name}</strong>
                      </div>
                      <div>
                        <span>{day.accommodation.notes}</span>
                        <span>{formatCurrency(day.accommodation.cost, itinerary.currency)} per night</span>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <footer className="preview-actions">
        <div className="export-menu">
          <button type="button" className="btn btn--ghost" onClick={() => {
            const url = `${window.location.origin}/itinerary/${(itinerary as any).id || 'mock-id'}`;
            navigator.clipboard.writeText(url);
            alert(`Itinerary link copied to clipboard:\n${url}`);
          }}>
            Share Link
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => {
            const input = document.querySelector('.preview-card');
            if (input) {
              import('html2canvas').then(html2canvas => {
                import('jspdf').then(jsPDF => {
                  html2canvas.default(input as HTMLElement).then(canvas => {
                    const imgData = canvas.toDataURL('image/png');
                    const pdf = new jsPDF.default();
                    const imgProps = pdf.getImageProperties(imgData);
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    pdf.save("itinerary.pdf");
                  });
                });
              });
            }
          }}>
            Download PDF
          </button>
        </div>
        <div className="translate-menu">
          <select
            className="btn btn--ghost"
            onChange={(e) => {
              const lang = e.target.value;
              if (lang) {
                // Call translation API
                const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
                fetch(`${API_BASE_URL}/api/v1/translate-itinerary`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ itinerary, target_language: lang }),
                })
                .then(res => res.json())
                .then(translatedItinerary => {
                  setItinerary(translatedItinerary);
                });
              }
            }}
          >
            <option value="">Translate</option>
            <option value="Hindi">Hindi</option>
            <option value="Tamil">Tamil</option>
            <option value="Telugu">Telugu</option>
            <option value="Bengali">Bengali</option>
          </select>
        </div>
        <button type="button" className="btn btn--primary" disabled>
          Book via EMT (simulated)
        </button>
      </footer>
      </div>
      <ImageLightbox
        isOpen={Boolean(lightboxImage)}
        src={lightboxImage?.src ?? null}
        title={lightboxImage?.title ?? undefined}
        context={lightboxImage?.context ?? undefined}
        onClose={closeLightbox}
      />
    </>
  );
}


