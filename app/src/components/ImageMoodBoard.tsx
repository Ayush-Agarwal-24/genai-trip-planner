import { useEffect, useState } from "react";

type ImageMoodBoardProps = {
  destination: string;
  variant: "live" | "template" | "error";
  imageUrls?: string[];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export function ImageMoodBoard({ destination, variant, imageUrls }: ImageMoodBoardProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let canceled = false;
    async function run() {
      setLoaded(false);
      if (imageUrls && imageUrls.length) {
        if (!canceled) {
          setImages(imageUrls);
          setLoaded(true);
        }
        return;
      }
      if (!destination) {
        if (!canceled) {
          setImages([]);
          setLoaded(true);
        }
        return;
      }
      try {
        const resp = await fetch(`${API_BASE_URL}/api/v1/city-images?city=${encodeURIComponent(destination)}`);
        const data = await resp.json().catch(() => ({ images: [] }));
        const imgs = Array.isArray(data.images) ? data.images : [];
        if (!canceled) {
          setImages(imgs);
          setLoaded(true);
        }
      } catch {
        if (!canceled) {
          setImages([]);
          setLoaded(true);
        }
      }
    }
    run();
    return () => {
      canceled = true;
    };
  }, [destination, imageUrls?.join("|")]);

  if (!loaded) return null;

  const size = "clamp(280px, 28vw, 620px)";

  return (
    <div
      className={`moodboard moodboard--${variant}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, max-content)",
        justifyContent: "center",
        gap: 16,
        width: "100%"
      }}
    >
      {images.map((src, i) => (
        <figure
          key={src + i}
          className={`moodboard__tile moodboard__tile--${i}`}
          style={{
            width: size,
            height: size,
            margin: 0,
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(15,23,42,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 1px rgba(148,163,184,0.15) inset"
          }}
        >
          <img
            src={src}
            alt={`${destination || "Image"} ${i + 1}`}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block"
            }}
          />
        </figure>
      ))}
    </div>
  );
}
