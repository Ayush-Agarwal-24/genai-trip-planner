import { FormEvent, useMemo, useState } from 'react';
import type { TripPreferences } from '../App';
import { FaSpinner } from 'react-icons/fa';

const THEME_OPTIONS = ['Heritage', 'Food', 'Nightlife', 'Adventure', 'Wellness', 'Nature'];
const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali'];

const STATUS_COPY: Record<'idle' | 'loading' | 'success' | 'error', { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  idle: { label: 'Waiting for your inputs.', tone: 'neutral' },
  loading: { label: 'Generating itinerary with Gemini…', tone: 'warning' },
  success: { label: 'Itinerary refreshed from Gemini.', tone: 'success' },
  error: { label: 'We could not fetch a live plan. Try again shortly.', tone: 'danger' },
};

type RequestState = 'idle' | 'loading' | 'success' | 'error';

type ItineraryFormProps = {
  onSubmit: (prefs: TripPreferences & { enableLiveData: boolean }) => Promise<void>;
  isSubmitting: boolean;
  status: RequestState;
  lastError: string | null;
};

const CITY_OPTIONS = ['Delhi', 'Mumbai', 'Bangalore', 'Jaipur', 'Goa'];

export function ItineraryForm({ onSubmit, isSubmitting, status, lastError }: ItineraryFormProps) {
  const [formState, setFormState] = useState<Omit<TripPreferences, "enableLiveData">>({
    origin: 'Delhi',
    destination: 'Jaipur',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    budget: 25000,
    themes: ['Heritage', 'Food'],
    travellers: 2,
    language: 'English',
  });
  const [cityError, setCityError] = useState<string | null>(null);

  const isDisabled = useMemo(() => {
    if (isSubmitting) return true;
    return !formState.destination || !formState.startDate || !formState.endDate;
  }, [isSubmitting, formState.destination, formState.startDate, formState.endDate]);

  const handleCheckboxToggle = (theme: string) => {
    setFormState((prev) => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter((item) => item !== theme)
        : [...prev.themes, theme],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (formState.origin === formState.destination) {
      setCityError("Origin and destination cannot be the same city.");
      return;
    }
    setCityError(null);
    await onSubmit({ ...formState, enableLiveData: true });
  };

  const statusCopy = STATUS_COPY[status];

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <header className="form-card__header">
        <div>
          <p className="form-card__eyebrow">Trip builder</p>
          <h2>Tell us where you want to go</h2>
          <p className="form-card__subtitle">Mix and match themes, budgets, and languages. Live mode will call Gemini.</p>
        </div>
        <div className={`status-chip status-chip--${statusCopy.tone}`}>
          <span className="status-chip__dot" />
          <span>{statusCopy.label}</span>
        </div>
        {status === 'error' && lastError ? <p className="form-card__error">{lastError}</p> : null}
      </header>

      <section className="form-section">
        <h3>Travel basics</h3>
        <div className="field-grid">
          <label className="field field--select">
            <span>Origin city</span>
            <select
              value={formState.origin}
              onChange={(event) => {
                const newOrigin = event.target.value;
                setFormState((prev) => ({
                  ...prev,
                  origin: newOrigin,
                  // If destination is now the same, auto-select a different destination
                  destination: newOrigin === prev.destination
                    ? CITY_OPTIONS.find((c) => c !== newOrigin) || ""
                    : prev.destination,
                }));
              }}
              required
            >
              {CITY_OPTIONS.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </label>

          <label className="field field--select">
            <span>Destination city</span>
            <select
              value={formState.destination}
              onChange={(event) => setFormState((prev) => ({ ...prev, destination: event.target.value }))}
              required
            >
              {CITY_OPTIONS.filter((city) => city !== formState.origin).map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Start date</span>
            <input
              type="date"
              value={formState.startDate}
              onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
              required
            />
          </label>

          <label className="field">
            <span>End date</span>
            <input
              type="date"
              value={formState.endDate}
              onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
              required
            />
          </label>

          <label className="field">
            <span>Travellers</span>
            <input
              type="number"
              min="1"
              max="12"
              value={formState.travellers}
              onChange={(event) => setFormState((prev) => ({ ...prev, travellers: Number(event.target.value) }))}
              required
            />
          </label>

          <label className="field">
            <span>Budget (INR)</span>
            <input
              type="number"
              min="1000"
              step="500"
              value={formState.budget}
              onChange={(event) => setFormState((prev) => ({ ...prev, budget: Number(event.target.value) }))}
              required
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3>Themes & language</h3>
        <div className="theme-grid">
          {THEME_OPTIONS.map((theme) => {
            const active = formState.themes.includes(theme);
            return (
              <button
                key={theme}
                type="button"
                className={active ? 'pill pill--active' : 'pill'}
                onClick={() => handleCheckboxToggle(theme)}
              >
                {theme}
              </button>
            );
          })}
        </div>

        <label className="field field--select">
          <span>Preferred language</span>
          <select
            value={formState.language}
            onChange={(event) => setFormState((prev) => ({ ...prev, language: event.target.value }))}
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="form-section form-section--footer">
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isDisabled}>
            {isSubmitting ? (
              <span className="btn-loading">
                <FaSpinner className="spinner" />
                Crafting itinerary…
              </span>
            ) : (
              'Generate itinerary'
            )}
          </button>
          {cityError && <p className="form-card__error">{cityError}</p>}
        </div>
      </section>
    </form>
  );
}
