import { useEffect, useState } from "react";

type ImageMoodBoardProps = {
  destination: string;
  variant: "live" | "template" | "error";
  imageUrls?: string[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// Dummy Unsplash images for sample/prototype itinerary
const getUnsplashImages = (destination: string) => [
  `https://plus.unsplash.com/premium_photo-1661963054563-ce928e477ff3?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D`,
  `https://images.unsplash.com/photo-1603262110263-fb0112e7cc33?q=80&w=1171&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D`,
  `https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D`,
];

export function ImageMoodBoard({ destination, variant, imageUrls }: ImageMoodBoardProps) {
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    if (variant === "template") {
      // Use user-provided imageUrls if available, else fetch from backend, else fallback to Unsplash
      if (Array.isArray(imageUrls) && imageUrls.length > 0) {
        setImages(imageUrls);
      } else if (destination) {
        fetch(`${API_BASE_URL}/api/v1/city-images?city=${encodeURIComponent(destination)}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data.images) && data.images.length > 0) {
              setImages(data.images);
            } else {
              setImages(getUnsplashImages(destination));
            }
          })
          .catch(() => setImages(getUnsplashImages(destination)));
      } else {
        setImages(getUnsplashImages(destination));
      }
      return;
    }

    // if (variant === "live") {
    //   const fetchImages = async () => {
    //     const newImages: string[] = [];
    //     for (let i = 0; i < 3; i++) {
    //       try {
    //         const prompt = `${destination} travel inspiration ${i + 1}`;
    //         const res = await fetch(`${API_BASE_URL}/api/v1/generate-image`, {
    //           method: "POST",
    //           headers: { "Content-Type": "application/json" },
    //           body: JSON.stringify({ prompt }),
    //         });
    //         const data = await res.json();
    //         if (data.image_base64) {
    //           const cleanBase64 = data.image_base64.replace(/\s/g, '').trim();
    //           const dataUrl = `data:image/png;base64,${cleanBase64}`;
    //           console.log("Received image_base64 length:", cleanBase64.length);
    //           console.log("Sample data URL:", dataUrl.slice(0, 100) + "...");
    //           newImages.push(dataUrl);
    //         } else if (data.image_url) {
    //           console.log("Received image_url:", data.image_url);
    //           newImages.push(data.image_url);
    //         }
    //       } catch {
    //         // Do not push fallback images
    //       }
    //     }
    //     if (isMounted) setImages(newImages.filter(Boolean));
    //   };
    //   fetchImages();
    // } else {
    //   setImages([]); // For "error" or unknown variant, show nothing
    // }

    return () => {
      isMounted = false;
    };
  }, [destination, variant, imageUrls]);

  return (
    <div className={`moodboard moodboard--${variant}`}>
      {images.filter(Boolean).map((src, index) => (
        <figure key={src + index} className={`moodboard__tile moodboard__tile--${index}`}>
          <img
            src={src}
            alt={`${destination || "Image"} inspiration ${index + 1}`}
            loading="lazy"
          />
        </figure>
      ))}
    </div>
  );
}
