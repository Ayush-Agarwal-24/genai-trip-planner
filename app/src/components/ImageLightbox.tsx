import type { MouseEvent } from 'react';

type ImageLightboxProps = {
  isOpen: boolean;
  src: string | null;
  title?: string | null;
  context?: string | null;
  onClose: () => void;
};

export function ImageLightbox({ isOpen, src, title, context, onClose }: ImageLightboxProps) {
  if (!isOpen || !src) {
    return null;
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={handleBackdropClick}>
      <div className="lightbox__panel">
        <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close image viewer">
          Close
        </button>
        <div className="lightbox__media">
          <img src={src} alt={title ?? 'Preview image'} loading="lazy" />
        </div>
        {(title || context) && (
          <footer className="lightbox__meta">
            {title ? <h4>{title}</h4> : null}
            {context ? (
              <p>
                <a href={context} target="_blank" rel="noreferrer">
                  View source
                </a>
              </p>
            ) : null}
          </footer>
        )}
      </div>
    </div>
  );
}
