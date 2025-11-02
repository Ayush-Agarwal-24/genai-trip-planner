import React from 'react';
import { FaSun, FaCloud, FaCloudRain, FaSnowflake, FaWind } from 'react-icons/fa';

type WeatherData = {
  date: string;
  temp?: number;
  temp_min?: number;
  temp_max?: number;
  weather?: string;
  icon?: string;
  pop?: number;
};

type WeatherCardProps = {
  day: WeatherData;
};

export function WeatherCard({ day }: WeatherCardProps) {
  const condition = (day.weather || '').toLowerCase();
  const icon =
    condition.includes('sun') || condition === 'clear'
      ? <FaSun />
      : condition.includes('snow')
        ? <FaSnowflake />
        : condition.includes('rain')
          ? <FaCloudRain />
          : condition.includes('wind')
            ? <FaWind />
            : <FaCloud />;

  const tempDisplay = typeof day.temp === 'number' ? `${day.temp.toFixed(1)}\u00B0C` : '--';
  const minDisplay = typeof day.temp_min === 'number' ? `${day.temp_min.toFixed(1)}\u00B0` : '--';
  const maxDisplay = typeof day.temp_max === 'number' ? `${day.temp_max.toFixed(1)}\u00B0` : '--';
  const popValue = typeof day.pop === 'number' ? day.pop : Number(day.pop) || 0;
  const popDisplay = Math.round(popValue * 100);

  return (
    <div className="weather-card">
      <div className="weather-card__date">
        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
      <div className="weather-card__icon">{icon}</div>
      <div className="weather-card__temp">{tempDisplay}</div>
      <div className="weather-card__minmax">
        {minDisplay} / {maxDisplay}
      </div>
      <div className="weather-card__pop">
        <FaCloudRain /> {popDisplay}%
      </div>
    </div>
  );
}
