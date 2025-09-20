import './LiveStatusBanner.css';

export type LiveStatusVariant = 'idle' | 'live' | 'template' | 'error';

type LiveStatusBannerProps = {
  variant: LiveStatusVariant;
  lastGenerated?: string | null;
  message?: string | null;
};

const VARIANT_COPY: Record<LiveStatusVariant, { label: string; icon: string }> = {
  idle: { label: 'Prototype mode', icon: '🧪' },
  live: { label: 'Live Gemini mode', icon: '⚡' },
  template: { label: 'Standby mode', icon: '🧪' },
  error: { label: 'Live mode error', icon: '❌' },
};

export function LiveStatusBanner({ variant, lastGenerated, message }: LiveStatusBannerProps) {
  const copy = VARIANT_COPY[variant];
  return (
    <section className={`status-banner status-banner--${variant}`}>
      <div className="status-banner__icon" aria-hidden="true">
        {copy.icon}
      </div>
      <div className="status-banner__body">
        <p className="status-banner__title">{copy.label}</p>
        <p className="status-banner__message">{message ?? 'Toggle live mode to fetch a fresh plan.'}</p>
      </div>
      {lastGenerated ? (
        <div className="status-banner__meta">
          Last updated • {new Date(lastGenerated).toLocaleString()}
        </div>
      ) : null}
    </section>
  );
}
