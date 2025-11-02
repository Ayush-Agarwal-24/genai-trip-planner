import { useEffect, useState } from "react";

export type MoodboardImage = {
  src: string;
  title?: string;
  context?: string;
  label?: string;
  place?: string;
  width?: number;
  height?: number;
};

type ImageMoodBoardProps = {
  destination: string;
  variant: "live" | "template" | "error";
  itineraryImages?: MoodboardImage[];
  onImageClick?: (image: MoodboardImage) => void;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export function ImageMoodBoard({ destination, variant, itineraryImages, onImageClick }: ImageMoodBoardProps) {
  const [images, setImages] = useState<MoodboardImage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let canceled = false;
    async function run() {
      setLoaded(false);
      if (!destination) {
        if (!canceled) {
          setImages([]);
          setLoaded(true);
        }
        return;
      }
      try {
        const [heroResp, galleryResp] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/api/v1/city-hero?city=${encodeURIComponent(destination)}`),
          fetch(`${API_BASE_URL}/api/v1/city-images?city=${encodeURIComponent(destination)}&num=3`),
        ]);

        const heroImages: MoodboardImage[] = [];
        if (heroResp.status === "fulfilled") {
          const heroJson = await heroResp.value.json().catch(() => ({}));
          const heroUrl: string | null =
            heroJson?.image_url ??
            (heroJson?.image_base64 ? `data:image/jpeg;base64,${heroJson.image_base64}` : null);
          if (heroUrl) {
            heroImages.push({
              src: heroUrl,
              title: heroJson?.title ?? `${destination} skyline`,
              context: heroJson?.context,
              label: destination,
              place: destination,
              width: typeof heroJson?.width === "number" ? heroJson.width : undefined,
              height: typeof heroJson?.height === "number" ? heroJson.height : undefined,
            });
          }
        }

        const galleryImages: MoodboardImage[] = [];
        if (galleryResp.status === "fulfilled") {
          const galleryJson = await galleryResp.value.json().catch(() => ({}));
          const results = Array.isArray(galleryJson?.results) ? galleryJson.results : [];
          for (const item of results) {
            if (item?.link) {
              galleryImages.push({
                src: item.link,
                title: item.title,
                context: item.context,
                place: typeof item.place === "string" ? item.place : item.title,
                width: typeof item.width === "number" ? item.width : undefined,
                height: typeof item.height === "number" ? item.height : undefined,
              });
            }
          }
        }

        const provided = Array.isArray(itineraryImages) ? itineraryImages : [];
        const combined: MoodboardImage[] = [];
        const seen = new Set<string>();
        const keepImage = (item: MoodboardImage) => {
          const widthOk = typeof item.width === "number" ? item.width >= 320 : true;
          const heightOk = typeof item.height === "number" ? item.height >= 200 : true;
          return widthOk && heightOk;
        };
        for (const group of [heroImages, provided, galleryImages]) {
          for (const item of group) {
            if (!item?.src || seen.has(item.src) || !keepImage(item)) continue;
            seen.add(item.src);
            combined.push(item);
          }
        }

        if (!canceled) {
          setImages(combined.slice(0, 3));
          setLoaded(true);
        }
      } catch {
        if (!canceled) {
          const fallback = Array.isArray(itineraryImages) ? itineraryImages.slice(0, 3) : [];
          setImages(fallback);
          setLoaded(true);
        }
      }
    }
    run();
    return () => {
      canceled = true;
    };
  }, [destination, JSON.stringify(itineraryImages ?? [])]);

  if (!loaded || images.length === 0) return null;

  const columns = Math.min(images.length, 3) || 1;
  const size = "clamp(260px, 30vw, 420px)";

  return (
    <div
      className={`moodboard moodboard--${variant}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        justifyContent: "center",
        gap: 20,
        width: "100%"
      }}
    >
      {images.map((item, index) => (
        <button
          key={`${item.src}-${index}`}
          type="button"
          className={`moodboard__tile moodboard__tile--${index}`}
          style={{
            width: "100%",
            height: size,
            margin: 0,
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(15,23,42,0.8)",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 0 1px rgba(148,163,184,0.18) inset",
            cursor: onImageClick ? "zoom-in" : "default",
          }}
          onClick={() => {
            if (onImageClick) {
              onImageClick(item);
            }
          }}
        >
          <img
            src={item.src}
            alt={item.place || item.title || `${destination} travel inspiration`}
            loading="lazy"
            onError={(event) => {
              const target = event.currentTarget;
              target.style.display = "none";
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              flex: 1
            }}
          />
          {item.place && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                background: "rgba(15,23,42,0.75)",
              }}
            >
              {item.place}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
