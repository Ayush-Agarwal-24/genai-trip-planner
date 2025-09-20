import React from 'react';
import { FaSun, FaCloud, FaCloudRain, FaSnowflake, FaWind } from 'react-icons/fa';

type WeatherData = {
  date: string;
  temp: number;
  temp_min: number;
  temp_max: number;
  weather: string;
  icon: string;
  pop: number;
};

type WeatherCardProps = {
  day: WeatherData;
};

const weatherIconMap: { [key: string]: React.ReactElement } = {
  Clear: <FaSun />,
  Clouds: <FaCloud />,
  Rain: <FaCloudRain />,
  Snow: <FaSnowflake />,
  Wind: <FaWind />,
};

export function WeatherCard({ day }: WeatherCardProps) {
  const icon = weatherIconMap[day.weather] || <FaCloud />;

  return (
    <div className="weather-card">
      <div className="weather-card__date">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="weather-card__icon">{icon}</div>
      <div className="weather-card__temp">{day.temp.toFixed(1)}°C</div>
      <div className="weather-card__minmax">
        {day.temp_min.toFixed(1)}° / {day.temp_max.toFixed(1)}°
      </div>
      <div className="weather-card__pop">
        <FaCloudRain /> {Math.round(day.pop * 100)}%
      </div>
    </div>
  );
}
