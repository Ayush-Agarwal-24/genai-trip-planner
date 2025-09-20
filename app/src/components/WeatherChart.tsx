import React from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type WeatherData = {
  date: string;
  temp: number;
  temp_min: number;
  temp_max: number;
  weather: string;
  icon: string;
  pop: number;
};

type WeatherChartProps = {
  weatherData: {
    city: string;
    days: WeatherData[];
  } | null;
};

export function WeatherChart({ weatherData }: WeatherChartProps) {
  if (!weatherData || !weatherData.days || weatherData.days.length === 0) {
    return null;
  }

  const data = weatherData.days.map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    'Avg Temp (°C)': day.temp,
    'Min Temp (°C)': day.temp_min,
    'Max Temp (°C)': day.temp_max,
    'Precipitation (%)': day.pop * 100,
  }));

  return (
    <div style={{ marginTop: '20px', width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid stroke="#444" />
          <XAxis dataKey="date" stroke="#ccc" />
          <YAxis yAxisId="left" label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#ccc' }} stroke="#ccc" />
          <YAxis yAxisId="right" orientation="right" label={{ value: 'Precipitation (%)', angle: 90, position: 'insideRight', fill: '#ccc' }} stroke="#ccc" />
          <Tooltip
            contentStyle={{ backgroundColor: '#222', border: '1px solid #444' }}
            labelStyle={{ color: '#fff' }}
          />
          <Bar yAxisId="right" dataKey="Precipitation (%)" barSize={20} fill="#8884d8" />
          <Line yAxisId="left" type="monotone" dataKey="Avg Temp (°C)" stroke="#ff7300" />
          <Line yAxisId="left" type="monotone" dataKey="Min Temp (°C)" stroke="#82ca9d" />
          <Line yAxisId="left" type="monotone" dataKey="Max Temp (°C)" stroke="#ffc658" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
