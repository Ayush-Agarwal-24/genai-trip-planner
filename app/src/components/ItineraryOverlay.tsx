import React from 'react';
import type { Itinerary, TripPreferences } from '../App';
import { ItineraryPreview } from './ItineraryPreview';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

type ItineraryOverlayProps = {
  visible: boolean;
  onClose: () => void;
  itinerary: Itinerary;
  requestState: RequestState;
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary>>;
  preferences: TripPreferences | null;
  voiceMode: boolean;
};

export const ItineraryOverlay: React.FC<ItineraryOverlayProps> = ({
  visible,
  onClose,
  itinerary,
  requestState,
  setItinerary,
  preferences,
  voiceMode,
}) => {
  if (!visible) return null;
  return (
    <div className="preview-modal" role="dialog" aria-modal="true">
      <div className="preview-modal__backdrop" onClick={onClose} />
      <div className="preview-modal__content" style={{ maxWidth: 1100, maxHeight: '85vh', overflowY: 'auto' }}>
        <button type="button" className="preview-modal__close" onClick={onClose} aria-label="Close itinerary">
          X
        </button>
        <ItineraryPreview
          itinerary={itinerary}
          requestState={requestState}
          setItinerary={setItinerary}
          preferences={preferences}
          voiceMode={voiceMode}
        />
      </div>
    </div>
  );
};

