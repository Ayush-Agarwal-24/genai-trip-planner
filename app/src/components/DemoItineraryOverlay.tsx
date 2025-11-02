import React from 'react';
import type { Itinerary, ItineraryDay } from '../App';

type DemoItineraryOverlayProps = {
  visible: boolean;
  onClose: () => void;
  itinerary: Itinerary;
};

function formatCurrency(amount: number, currency: string) {
  const safeCurrency = currency || 'INR';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: safeCurrency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export const DemoItineraryOverlay: React.FC<DemoItineraryOverlayProps> = ({ visible, onClose, itinerary }) => {
  if (!visible) return null;
  const days: ItineraryDay[] = Array.isArray(itinerary.days) ? itinerary.days : [];

  return (
    <div className="preview-modal" role="dialog" aria-modal="true">
      <div className="preview-modal__backdrop" onClick={onClose} />
      <div className="preview-modal__content" style={{ maxWidth: 840, maxHeight: '85vh', overflowY: 'auto' }}>
        <button type="button" className="preview-modal__close" onClick={onClose} aria-label="Close demo">
          X
        </button>
        <h3 style={{ marginBottom: '0.5rem' }}>Demo Itinerary</h3>
        <p className="muted" style={{ marginTop: 0 }}>{itinerary.destination}</p>

        <div className="preview-card__stats" style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
          <div className="stat-card">
            <span className="stat-card__label">Budget</span>
            <strong className="stat-card__value">{formatCurrency(itinerary.budget, itinerary.currency)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Estimated spend</span>
            <strong className="stat-card__value">{formatCurrency(itinerary.totalEstimatedCost, itinerary.currency)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Days</span>
            <strong className="stat-card__value">{days.length}</strong>
          </div>
        </div>

        {days.map((day, i) => (
          <section key={`demo-day-${i}`} className="preview-section" style={{ paddingTop: 0 }}>
            <h4 style={{ marginBottom: 4 }}>{day.dateLabel}</h4>
            <p className="muted" style={{ marginTop: 0 }}>{day.summary}</p>
            <ol className="timeline-modern" style={{ paddingLeft: 0 }}>
              {(day.activities || []).map((act, j) => (
                <li key={`demo-act-${i}-${j}`} className="timeline-modern__activity">
                  <div className="timeline-modern__activity-header">
                    <span className="timeline-modern__time">{act.time}</span>
                    <span className="timeline-modern__title">{act.title}</span>
                    <span className="timeline-modern__badge">Demo</span>
                  </div>
                  <p className="timeline-modern__description">{act.description}</p>
                  <footer className="timeline-modern__footer">
                    <span>{act.location}</span>
                    <span>{typeof act.cost === 'number' ? formatCurrency(act.cost, itinerary.currency) : act.cost}</span>
                  </footer>
                </li>
              ))}
            </ol>
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
          </section>
        ))}

        <div className="preview-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
