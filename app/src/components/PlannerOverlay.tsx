import React from 'react';
import { ItineraryForm } from './ItineraryForm';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

type PlannerOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (prefs: any) => Promise<void>;
  isSubmitting: boolean;
  status: RequestState;
  lastError: string | null;
};

export const PlannerOverlay: React.FC<PlannerOverlayProps> = ({ visible, onClose, onSubmit, isSubmitting, status, lastError }) => {
  if (!visible) return null;
  return (
    <div className="preview-modal" role="dialog" aria-modal="true">
      <div className="preview-modal__backdrop" onClick={onClose} />
      <div className="preview-modal__content planner-overlay" style={{ maxWidth: 980, maxHeight: '85vh', overflowY: 'auto' }}>
        <button type="button" className="preview-modal__close" onClick={onClose} aria-label="Close planner">
          X
        </button>
        <h3 style={{ marginTop: 0 }}>Trip Planner</h3>
        <p className="muted" style={{ marginTop: 0 }}>Fill the basics and generate a live itinerary.</p>
        <ItineraryForm onSubmit={onSubmit} isSubmitting={isSubmitting} status={status} lastError={lastError} />
      </div>
    </div>
  );
};
