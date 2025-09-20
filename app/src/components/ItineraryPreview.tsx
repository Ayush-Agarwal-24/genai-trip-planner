import type { Itinerary, ItineraryDay, ItineraryMeta } from '../App';
import { ImageMoodBoard } from './ImageMoodBoard';
import { WeatherChart } from './WeatherChart';
import { MapView } from './MapView';
import { WeatherCard } from './WeatherCard';

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

type ItineraryPreviewProps = {
  itinerary: Itinerary;
  requestState: 'idle' | 'loading' | 'success' | 'error';
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary>>;
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

function countExperiences(days: ItineraryDay[]) {
  return days.reduce((sum, day) => sum + day.activities.length, 0);
}

import { useState, useEffect } from 'react';

export function ItineraryPreview({ itinerary, requestState, setItinerary }: ItineraryPreviewProps) {
  const meta: ItineraryMeta | undefined = itinerary.meta;
  const statusKey = meta?.source ?? 'template';
  const tone = SOURCE_TONE[statusKey] ?? 'template';
  const heading = SOURCE_COPY[statusKey] ?? 'Itinerary overview';
  const hasError = Boolean(meta?.error);

  // Weather state
  const [weather, setWeather] = useState<any | null>(null);
  const [weatherSummary, setWeatherSummary] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Smart tips state
  const [smartTips, setSmartTips] = useState<string[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);

  // Map view state
  const [showMap, setShowMap] = useState(false);

  // Prefer base64 image, fallback to image_url
  let itineraryImage: string | null = null;
  if (itinerary.image_base64) {
    itineraryImage = `data:image/png;base64,${itinerary.image_base64}`;
  } else if (itinerary.image_url) {
    itineraryImage = itinerary.image_url;
  }

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

  const handleShowWeather = async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    setWeather(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
      // Extract start and end dates from itinerary.days if available
      let startDate = "";
      let endDate = "";
      if (itinerary.days && itinerary.days.length > 0) {
        // Try to extract a date from the first and last dayLabel (assume format "Day 1 – YYYY-MM-DD" or similar)
        const firstLabel = itinerary.days[0].dateLabel;
        const lastLabel = itinerary.days[itinerary.days.length - 1].dateLabel;
        // Try to find a date in the label (YYYY-MM-DD or DD/MM/YYYY)
        const dateRegex = /\d{4}-\d{2}-\d{2}/;
        const firstMatch = firstLabel.match(dateRegex);
        const lastMatch = lastLabel.match(dateRegex);
        startDate = firstMatch ? firstMatch[0] : new Date().toISOString().slice(0, 10);
        endDate = lastMatch ? lastMatch[0] : new Date().toISOString().slice(0, 10);
      } else {
        startDate = endDate = new Date().toISOString().slice(0, 10);
      }
      const url = `${API_BASE_URL}/api/v1/weather-forecast?city=${encodeURIComponent(itinerary.destination)}&start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setWeatherError(data.error);
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
    <div className="preview-card">
      {itineraryImage && (
        <div style={{ marginBottom: '1.5rem', borderRadius: '20px', overflow: 'hidden' }}>
          <img
            src={itineraryImage}
            alt={`${itinerary.destination} itinerary`}
            style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}
      {(tone === "template" || tone === "live") && (
        <ImageMoodBoard
          destination={itinerary.destination}
          variant={tone}
          imageUrls={tone === "template" ? (itinerary as any).image_urls : undefined}
        />
      )}

      <div style={{ margin: "1rem 0", display: "flex", gap: "1rem" }}>
        <button className="btn btn--ghost" onClick={handleShowWeather} disabled={weatherLoading}>
          {weatherLoading ? "Loading weather..." : "Show Weather"}
        </button>
        <button className="btn btn--ghost" onClick={() => setShowMap(!showMap)}>
          {showMap ? "Hide Map" : "Show Map View"}
        </button>
      </div>
      {weatherError && <div style={{ color: "red", marginTop: 8 }}>{weatherError}</div>}
        {weather && (
          <div style={{ marginTop: 12 }}>
            <h4>Weather Forecast for {weather.city}</h4>
            {weatherSummary && <p>{weatherSummary}</p>}
            {weather.warning && <div style={{ color: "orange" }}>{weather.warning}</div>}
            <div className="weather-card-grid">
              {weather.days?.map((day: any) => (
                <WeatherCard key={day.date} day={day} />
              ))}
            </div>
          </div>
        )}
      {showMap && <MapView itinerary={itinerary} />}
      {smartTips.length > 0 && (
        <section className="preview-section">
          <h3>Smart Tips</h3>
          <ul>
            {smartTips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
      <header className="preview-card__header">
        <div>
          <span className={classNames('badge', `badge--${tone}`)}>{heading}</span>
          <h2>{itinerary.destination || 'Your itinerary will appear here'}</h2>
          <p className="preview-card__meta">
            Last generated • {new Date(itinerary.createdAt).toLocaleString()}
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
              if (advisory.includes('rain') || advisory.includes('shower')) return '🌧️';
              if (advisory.includes('sun') || advisory.includes('clear')) return '☀️';
              if (advisory.includes('cloud')) return '⛅';
              if (advisory.includes('storm')) return '⛈️';
              if (advisory.includes('snow')) return '❄️';
              if (advisory.includes('wind')) return '💨';
              return '🌤️';
            })()}
          </div>
          <p>{itinerary.weatherAdvisory}</p>
        </section>
      ) : null}

      {!hasError && itinerary.costBreakdown.length ? (
        <section className="preview-costs">
          <h3>Cost breakdown</h3>
          <div className="preview-costs__grid">
            {itinerary.costBreakdown.map((item) => {
              // Simple icon mapping for categories
              const iconMap: Record<string, string> = {
                Accommodation: "🏨",
                Stay: "🏨",
                "Food & Drinks": "🍽️",
                Food: "🍽️",
                "Activities & Entry Fees": "🎟️",
                Experiences: "🎟️",
                "Local Transport": "🚗",
                Transport: "🚗",
                "Shopping & Souvenirs": "🛍️",
                Shopping: "🛍️",
                "Buffer & Miscellaneous": "💸",
                Miscellaneous: "💸",
              };
              const icon = iconMap[item.category] || "💰";
              return (
                <div key={item.category} className="cost-card">
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

      {!hasError && itinerary.days.length ? (
        <section className="preview-timeline">
          <h3>Daily flow</h3>
          <ol className="timeline-modern">
            {itinerary.days.map((day) => (
              <li key={day.dateLabel} className="timeline-modern__day">
                <div className="timeline-modern__header">
                  <h4>{day.dateLabel}</h4>
                  <p>{day.summary}</p>
                </div>
                <ul className="timeline-modern__activities">
                  {day.activities.map((activity) => (
                    <li key={`${day.dateLabel}-${activity.time}-${activity.title}`} className="timeline-modern__activity">
                      <div className="timeline-modern__activity-header">
                        <span className="timeline-modern__time">{activity.time}</span>
                        <span className="timeline-modern__title">{activity.title}</span>
                        <span
                          className={classNames(
                            'timeline-modern__badge',
                            activity.source !== 'mock' && 'timeline-modern__badge--live',
                          )}
                        >
                          {activity.source === 'mock' ? 'Prototype' : 'Live'}
                        </span>
                      </div>
                      {/* Activity image */}
                      {/* No fallback image logic; remove Unsplash and fallback */}
                      <p className="timeline-modern__description">{activity.description}</p>
                      <footer className="timeline-modern__footer">
                        <span>{activity.location}</span>
                        <span>{formatCurrency(activity.cost, itinerary.currency)}</span>
                      </footer>
                    </li>
                  ))}
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
            ))}
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
  );
}
