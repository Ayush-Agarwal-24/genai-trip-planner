import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { APIProvider, Map, InfoWindow, AdvancedMarker, Marker, useMap } from '@vis.gl/react-google-maps';
import type { Itinerary } from '../App';

type MapViewProps = { itinerary: Itinerary };
type Loc = { lat: number; lng: number; title?: string };

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';
const API_KEY =
  ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (import.meta.env.VITE_MAPS_API_KEY as string | undefined) ||
    '') as string;
const MAP_ID =
  ((import.meta.env.VITE_MAP_ID as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) ||
    '') as string;

function FitBounds({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  const key = useMemo(() => points.map(p => `${p.lat},${p.lng}`).join('|'), [points]);
  useEffect(() => {
    if (!map || !points.length) return;
    const g: any = (window as any).google;
    if (!g?.maps?.LatLngBounds) return;
    if (points.length === 1) {
      map.setCenter(points[0] as any);
      map.setZoom(14);
      return;
    }
    const b = new g.maps.LatLngBounds();
    points.forEach(p => b.extend(p as any));
    map.fitBounds(b, 64);
  }, [map, key]);
  return null;
}

function MapIdle({ onReady }: { onReady: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', () => onReady());
    return () => {
      listener && listener.remove();
    };
  }, [map, onReady]);
  return null;
}

function LoaderOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        zIndex: 2
      }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <g fill="none" strokeWidth="4">
          <circle cx="22" cy="22" r="18" stroke="rgba(147,197,253,0.35)" />
          <path d="M40 22c0-9.941-8.059-18-18-18" stroke="#93C5FD">
            <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.8s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    </div>
  );
}

export function MapView({ itinerary }: MapViewProps) {
  const names = useMemo(() => {
    const xs: string[] = [];
    for (const d of itinerary?.days || []) {
      for (const a of d.activities || []) {
        if (a.location && !xs.includes(a.location)) xs.push(a.location);
      }
    }
    return xs.slice(0, 30);
  }, [itinerary]);

  const city = useMemo(() => {
    const s = (itinerary?.destination || '').split(',')[0]?.trim() || '';
    return s;
  }, [itinerary]);

  const [markers, setMarkers] = useState<Loc[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const cancelHide = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      setHoveredIdx(null);
      hideTimerRef.current = null;
    }, 150);
  };

  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!names.length) {
        setMarkers([]);
        setHoveredIdx(null);
        setFetching(false);
        return;
      }
      setFetching(true);
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/v1/geocode-locations?city=${encodeURIComponent(city)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(names)
          }
        );
        const data = await resp.json();
        const res = data?.results || {};
        const list: Loc[] = names
          .map((k: string) => {
            const r = res[k];
            if (!r) return null as any;
            const lat = Number(r.lat);
            const lng = Number(r.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null as any;
            return { lat, lng, title: k };
          })
          .filter(Boolean) as Loc[];
        if (!canceled) {
          setMarkers(list);
          setHoveredIdx(null);
        }
      } catch {
        if (!canceled) {
          setMarkers([]);
          setHoveredIdx(null);
        }
      } finally {
        if (!canceled) setFetching(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [names.join('|'), city]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  useEffect(() => {
    return () => cancelHide();
  }, []);

  if (!API_KEY) return null;

  const center = markers[0]
    ? { lat: markers[0].lat, lng: markers[0].lng }
    : { lat: 22.9734, lng: 78.6569 };

  const showLoader = fetching || !mapReady;
  const active = hoveredIdx !== null ? markers[hoveredIdx] : null;

  return (
    <APIProvider apiKey={API_KEY} libraries={['marker']}>
      <div style={{ position: 'relative', width: '100%', height: 400 }}>
        <LoaderOverlay visible={showLoader} />
        <Map {...(MAP_ID ? { mapId: MAP_ID } : {})} center={center} zoom={12} disableDefaultUI={false}>
          <MapIdle onReady={handleMapReady} />
          <FitBounds points={markers} />
          {markers.map((m, i) =>
            MAP_ID ? (
              <AdvancedMarker
                key={`${m.lat}-${m.lng}-${i}`}
                position={{ lat: m.lat, lng: m.lng }}
                title={m.title}
                onMouseEnter={() => {
                  cancelHide();
                  setHoveredIdx(i);
                }}
                onMouseLeave={() => {
                  scheduleHide();
                }}
              />
            ) : (
              <Marker
                key={`${m.lat}-${m.lng}-${i}`}
                position={{ lat: m.lat, lng: m.lng }}
                title={m.title}
                onMouseOver={() => {
                  cancelHide();
                  setHoveredIdx(i);
                }}
                onMouseOut={() => {
                  scheduleHide();
                }}
              />
            )
          )}
          {active && (
            <InfoWindow position={{ lat: active.lat, lng: active.lng }}>
              <div
                onMouseEnter={cancelHide}
                onMouseLeave={scheduleHide}
                style={{ color: '#0f172a' }}
              >
                <div style={{ fontWeight: 600 }}>{active.title}</div>
              </div>
            </InfoWindow>
          )}
        </Map>
      </div>
    </APIProvider>
  );
}
