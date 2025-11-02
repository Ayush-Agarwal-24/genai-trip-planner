type TravelCompassProps = {
  insights: {
    overallScore: number;
    badge?: string;
    axes: Array<{
      id: string;
      label: string;
      score: number;
      status?: string;
      explanation?: string;
    }>;
    alerts?: string[];
    suggestedActions?: string[];
    generatedAt?: string;
  };
};

function statusClass(status?: string) {
  switch (status) {
    case 'great':
      return 'travel-compass__meter-fill--great';
    case 'risk':
      return 'travel-compass__meter-fill--risk';
    case 'caution':
      return 'travel-compass__meter-fill--caution';
    default:
      return '';
  }
}

export function TravelCompass({ insights }: TravelCompassProps) {
  if (!insights || !insights.axes || insights.axes.length === 0) {
    return null;
  }

  const {
    overallScore,
    badge,
    axes,
    alerts = [],
    suggestedActions = [],
    generatedAt,
  } = insights;

  return (
    <section className="travel-compass">
      <header className="travel-compass__header">
        <div>
          <h3>Travel Readiness Compass</h3>
          <p>Instant pulse across budget, logistics, weather resilience, sustainability, and theme fit.</p>
        </div>
        <div className="travel-compass__score">
          <span className="travel-compass__score-value">{overallScore}</span>
          <span className="travel-compass__score-label">{badge ?? 'Status'}</span>
          {generatedAt && (
            <span className="travel-compass__timestamp">
              Updated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>
      <ul className="travel-compass__axes">
        {axes.map((axis) => (
          <li key={axis.id} className="travel-compass__axis">
            <div className="travel-compass__axis-heading">
              <span>{axis.label}</span>
              <span>{axis.score}</span>
            </div>
            <div className="travel-compass__meter">
              <div
                className={`travel-compass__meter-fill ${statusClass(axis.status)}`}
                style={{ width: `${Math.min(100, Math.max(0, axis.score))}%` }}
              />
            </div>
            {axis.explanation && <p className="travel-compass__axis-copy">{axis.explanation}</p>}
          </li>
        ))}
      </ul>
      {(alerts.length > 0 || suggestedActions.length > 0) && (
        <div className="travel-compass__insights">
          {alerts.length > 0 && (
            <div className="travel-compass__alerts">
              <h4>Alerts</h4>
              <ul>
                {alerts.map((alert, index) => (
                  <li key={`alert-${index}`}>{alert}</li>
                ))}
              </ul>
            </div>
          )}
          {suggestedActions.length > 0 && (
            <div className="travel-compass__actions">
              <h4>Next best actions</h4>
              <ul>
                {suggestedActions.map((action, index) => (
                  <li key={`action-${index}`}>{action}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

