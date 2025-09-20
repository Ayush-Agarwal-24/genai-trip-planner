// MapView.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  InfoWindow,
  useMap,
  AdvancedMarker,
  Marker
} from '@vis.gl/react-google-maps';
import type { Itinerary } from '../App';

const containerStyle: React.CSSProperties = { width: '100%', height: '400px' };

type MapViewProps = { itinerary: Itinerary };
type Loc = { lat: number; lng: number; title?: string; description?: string };

function Directions({ directions }: { directions: any }) {
  const map = useMap();
  const polylineRef = useRef<any>(null);

  useEffect(() => {
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (!map || !directions?.routes?.length) return;

    const g = (window as any).google;
    if (!g?.maps?.geometry?.encoding) return;

    const points = directions.routes[0]?.overview_polyline?.points;
    if (!points) return;

    const path = g.maps.geometry.encoding.decodePath(points);
    const polyline = new g.maps.Polyline({
      path,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeWeight: 2
    });
    polyline.setMap(map);
    polylineRef.current = polyline;

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, directions]);

  return null;
}

function FitBounds({ points }: { points: Array<Pick<Loc, 'lat' | 'lng'>> }) {
  const map = useMap();
  const key = useMemo(() => points.map(p => `${p.lat},${p.lng}`).join('|'), [points]);

  useEffect(() => {
    if (!map || !points.length) return;

    const g = (window as any).google;
    if (!g?.maps?.LatLngBounds) return;

    if (points.length === 1) {
      map.setCenter(points[0] as any);
      map.setZoom(14);
      return;
    }

    const bounds = new g.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p as any));
    map.fitBounds(bounds, 64); // 64px padding
  }, [map, key]);

  return null;
}

export function MapView({ itinerary }: MapViewProps) {
  const [activeMarker, setActiveMarker] = useState<Loc | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [directions, setDirections] = useState<any>(null);

  useEffect(() => {
    const locationNames = itinerary.days
      .flatMap(d => d.activities.map(a => a.location))
      .filter(Boolean);

    const uniqueLocations = [...new Set(locationNames)];
    if (!uniqueLocations.length) {
      setLocations([]);
      setDirections(null);
      return;
    }

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
    const abort = new AbortController();

    (async () => {
      try {
        // Geocode in batch
        const geoRes = await fetch(`${API_BASE_URL}/api/v1/geocode-locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uniqueLocations),
          signal: abort.signal
        });
        const geoData = await geoRes.json();

        // Build marker list: coerce numbers, map "lon" → "lng", filter invalids
        const geocoded: Loc[] = itinerary.days
          .flatMap(day =>
            day.activities.map(activity => {
              const coords = geoData?.results?.[activity.location];
              const lat = Number(coords?.lat);
              const lng = Number(coords?.lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              return {
                lat,
                lng,
                title: activity.title,
                description: activity.description
              } as Loc;
            })
          )
          .filter((l): l is Loc => !!l);

        setLocations(geocoded);

        if (!geocoded.length) {
          setDirections(null);
          return;
        }

        // Directions (optional)
        const origin = geocoded[0];
        const destination = geocoded[geocoded.length - 1];
        const waypoints = geocoded.slice(1, -1);

        const dirRes = await fetch(`${API_BASE_URL}/api/v1/directions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination, waypoints }),
          signal: abort.signal
        });
        const dirData = await dirRes.json();
        setDirections(dirData);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setDirections(null);
      }
    })();

    return () => abort.abort();
  }, [itinerary]);

  const apiKey = import.meta.env.VITE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_MAP_ID; // optional; if present we’ll use AdvancedMarker
  const useAdvanced = Boolean(mapId);

  if (!apiKey) {
    return (
      <div style={{ padding: 12 }}>
        <strong>Missing VITE_MAPS_API_KEY</strong> — add it to <code>.env.local</code>.
      </div>
    );
  }

  const defaultCenter = locations[0] ?? { lat: 26.9124, lng: 75.7873 };

  return (
    <APIProvider apiKey={apiKey} libraries={['geometry', 'marker']}>
      <div style={containerStyle}>
        <Map
          {...(useAdvanced ? { mapId } : {})}  // only pass mapId when truthy
          defaultCenter={defaultCenter}
          defaultZoom={10}
          disableDefaultUI={false}
        >
          <FitBounds points={locations} />

          {locations.map((loc, i) =>
            useAdvanced ? (
              <AdvancedMarker
                key={`${loc.lat}-${loc.lng}-${i}`}
                position={{ lat: loc.lat, lng: loc.lng }}
                onClick={() => setActiveMarker(loc)}
                title={loc.title}
              />
            ) : (
              <Marker
                key={`${loc.lat}-${loc.lng}-${i}`}
                position={{ lat: loc.lat, lng: loc.lng }}
                onClick={() => setActiveMarker(loc)}
                title={loc.title}
              />
            )
          )}

          {activeMarker && (
            <InfoWindow
              position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
              onCloseClick={() => setActiveMarker(null)}
            >
              <div>
                <h4 style={{ margin: 0 }}>{activeMarker.title}</h4>
                <p style={{ margin: '4px 0 0' }}>{activeMarker.description}</p>
              </div>
            </InfoWindow>
          )}

          <Directions directions={directions} />
        </Map>
      </div>
    </APIProvider>
  );
}
