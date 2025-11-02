import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Itinerary, TripPreferences } from '../App';

type VoiceModeOverlayProps = {
  itinerary: Itinerary;
  preferences: TripPreferences | null;
  disabled: boolean;
  onApplyItinerary: (next: Itinerary) => void;
  onClose: () => void;
  onItineraryReady?: () => void;
};

type VoiceMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

type VoiceSessionResponse = {
  sessionId: string;
  text: string;
  audio?: string | null;
  warnings?: string[] | null;
};

type VoiceReplyResponse = {
  reply: string;
  audio?: string | null;
  complete: boolean;
  itinerary?: Itinerary;
  preferences?: Record<string, unknown>;
  warnings?: string[] | null;
};

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.API_BASE_URL as string | undefined) ??
  'http://localhost:8000';

const MICROPHONE_SUPPORTED = (() => {
  if (typeof window === 'undefined') {
    return false;
  }
  const mediaSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const recorderSupported = typeof window.MediaRecorder !== 'undefined';
  return mediaSupported && recorderSupported;
})();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1] || '');
      } else {
        reject(new Error('Failed to decode audio input'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function playAudio(audioBase64?: string | null) {
  if (!audioBase64) return;
  const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
  // Slightly slower playback for clarity; preserve pitch if supported.
  try {
    audio.playbackRate = 0.96;
    // @ts-expect-error preservesPitch is not in the TS lib by default
    if ('preservesPitch' in audio) (audio as any).preservesPitch = true;
    // @ts-expect-error webkitPreservesPitch is not in the TS lib by default
    if ('webkitPreservesPitch' in audio) (audio as any).webkitPreservesPitch = true;
    // @ts-expect-error mozPreservesPitch is not in the TS lib by default
    if ('mozPreservesPitch' in audio) (audio as any).mozPreservesPitch = true;
  } catch {}
  void audio.play().catch((error) => {
    console.warn('Audio playback failed', error);
  });
}

function uniqueId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function VoiceModeOverlay({ disabled, onApplyItinerary, onClose, onItineraryReady }: VoiceModeOverlayProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [itineraryLoaded, setItineraryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionStartedRef = useRef(false);
  const lastAudioRef = useRef<HTMLAudioElement | null>(null);

  const canRecord = useMemo(
    () => MICROPHONE_SUPPORTED && !disabled && !!sessionId && !isProcessing && !sessionComplete,
    [disabled, isProcessing, sessionComplete, sessionId],
  );

  const appendMessage = useCallback((message: VoiceMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const BROWSER_TTS_SUPPORTED = useMemo(() => {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }, []);

  function playAssistantResponse(text: string, audioBase64?: string | null) {
    // Prefer client TTS for natural prosody when available; fallback to server MP3.
    if (BROWSER_TTS_SUPPORTED && text) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95; // slightly slower
        utterance.pitch = 1.05; // a touch warmer
        window.speechSynthesis.speak(utterance);
        return;
      } catch (e) {
        console.warn('Client TTS failed, falling back to audio', e);
      }
    }
    // Fallback to server-provided audio
    if (audioBase64) {
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      try {
        audio.playbackRate = 0.96;
        // @ts-expect-error preservesPitch family
        if ('preservesPitch' in audio) (audio as any).preservesPitch = true;
      } catch {}
      lastAudioRef.current = audio;
      void audio.play().catch((error) => {
        console.warn('Audio playback failed', error);
      });
    }
  }

  const startSession = useCallback(async () => {
    if (!MICROPHONE_SUPPORTED) {
      setError('Microphone access is unavailable on this device.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/voice/session/start`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to initialise voice session');
      }
      const payload: VoiceSessionResponse = await response.json();
      setSessionId(payload.sessionId);
      appendMessage({ id: uniqueId(), role: 'assistant', text: payload.text });
      playAssistantResponse(payload.text, payload.audio);
      if (payload.warnings?.length) {
        setError(payload.warnings.join(' '));
      }
    } catch (err) {
      console.error(err);
      setError('Unable to start the live assistant right now. Please try again shortly.');
    }
  }, [appendMessage]);

  useEffect(() => {
    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      void startSession();
    }
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, [startSession]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendAssistantMessage = useCallback(
    async (message: string) => {
      if (!sessionId) return;
      try {
        setIsProcessing(true);
        const response = await fetch(`${API_BASE_URL}/api/v1/voice/session/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!response.ok) {
          throw new Error('Voice assistant is unavailable');
        }
        const payload: VoiceReplyResponse = await response.json();
        appendMessage({ id: uniqueId(), role: 'assistant', text: payload.reply });
        playAssistantResponse(payload.reply, payload.audio);
        if (payload.warnings?.length) {
          setError(payload.warnings.join(' '));
        } else {
          setError(null);
        }
        if (payload.itinerary) {
          onApplyItinerary(payload.itinerary);
          setItineraryLoaded(true);
        }
        if (payload.complete) {
          setSessionComplete(true);
        }
        // If itinerary is ready and session is complete, notify host to show the overlay.
        if (payload.itinerary && payload.complete) {
          try {
            onItineraryReady?.();
          } catch (e) {
            // non-fatal UI callback error
            console.warn('onItineraryReady callback failed', e);
          }
          // Close voice overlay once plan is loaded and shown
          try {
            onClose();
          } catch (e) {
            console.warn('Closing voice overlay failed', e);
          }
        }
      } catch (err) {
        console.error(err);
        setError('I hit a snag responding to that. Let’s try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [appendMessage, onApplyItinerary, sessionId],
  );

  const processRecording = useCallback(
    async (audioBase64: string) => {
      if (!sessionId) return;
      try {
        const transcriptResponse = await fetch(
          `${API_BASE_URL}/api/v1/voice/session/${sessionId}/transcribe`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: audioBase64 }),
          },
        );
        if (!transcriptResponse.ok) {
          throw new Error('Transcription failed');
        }
        const transcriptPayload: { transcript: string } = await transcriptResponse.json();
        const transcript = (transcriptPayload.transcript || '').trim();
        if (!transcript) {
          await sendAssistantMessage('not sure');
          return;
        }
        appendMessage({ id: uniqueId(), role: 'user', text: transcript });
        await sendAssistantMessage(transcript);
      } catch (err) {
        console.error(err);
        setError('Something went wrong understanding that reply. Let’s try again.');
      }
    },
    [appendMessage, sendAssistantMessage, sessionId],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!canRecord) {
      return;
    }
    setError(null);
    try {
      // Barge-in: stop any current assistant audio/tts when user starts speaking
      try {
        if (BROWSER_TTS_SUPPORTED) {
          window.speechSynthesis.cancel();
        }
        if (lastAudioRef.current) {
          lastAudioRef.current.pause();
          lastAudioRef.current.currentTime = 0;
          lastAudioRef.current = null;
        }
      } catch {}
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        if (chunksRef.current.length === 0) {
          return;
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        try {
          setIsProcessing(true);
          const audioBase64 = await blobToBase64(blob);
          await processRecording(audioBase64);
        } finally {
          setIsProcessing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError('I could not access your microphone. Please check permissions and try again.');
    }
  }, [canRecord, processRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true">
      <div className="voice-overlay__backdrop" />
      <div className="voice-overlay__shell">
        <header className="voice-overlay__header">
          <div>
            <span className="voice-overlay__badge">Live Voice Mode</span>
            <h2>Ava — Travel Planning Agent</h2>
            <p>Speak naturally. Ava will listen, clarify details, and craft your itinerary in real time.</p>
          </div>
          <button type="button" className="voice-overlay__close" onClick={onClose}>
            Exit
          </button>
        </header>

        <div className="voice-overlay__conversation" ref={scrollRef}>
          {messages.map((message) => (
            <div key={message.id} className={`voice-bubble voice-bubble--${message.role}`}>
              {message.text}
            </div>
          ))}
          {sessionComplete && itineraryLoaded ? (
            <div className="voice-bubble voice-bubble--assistant">
              Your itinerary is now loaded in the planner. Feel free to explore it or ask for more tweaks.
            </div>
          ) : null}
        </div>

        <footer className="voice-overlay__controls">
          {error ? <div className="voice-overlay__error">{error}</div> : null}
          <div className="voice-overlay__actions">
            <button
              type="button"
              className={`voice-overlay__mic ${isRecording ? 'voice-overlay__mic--active' : ''}`}
              onClick={toggleRecording}
              disabled={!canRecord}
            >
              {isRecording ? 'Listening… tap to finish' : 'Tap to speak'}
            </button>
            <button type="button" className="voice-overlay__secondary" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="voice-overlay__hint">
            {sessionComplete
              ? itineraryLoaded
                ? 'Your tailored plan is ready.'
                : 'Hang tight while I wrap things up.'
              : 'Ava will guide you through origin, destination, dates, travellers, budget, and experiences.'}
          </p>
        </footer>
      </div>
    </div>
  );
}
