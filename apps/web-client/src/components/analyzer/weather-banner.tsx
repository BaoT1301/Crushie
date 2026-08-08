"use client";

import { Cloud, Sun, CloudRain, CloudSnow, Wind, Droplets } from "lucide-react";
import { motion } from "framer-motion";
import type { WeatherContext } from "@/types/analyzer";

interface WeatherBannerProps {
  weather: WeatherContext;
  city: string;
}

const WEATHER_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "01d": Sun,
  "01n": Sun,
  "02d": Cloud,
  "02n": Cloud,
  "03d": Cloud,
  "03n": Cloud,
  "04d": Cloud,
  "04n": Cloud,
  "09d": CloudRain,
  "09n": CloudRain,
  "10d": CloudRain,
  "10n": CloudRain,
  "11d": CloudRain,
  "11n": CloudRain,
  "13d": CloudSnow,
  "13n": CloudSnow,
  "50d": Wind,
  "50n": Wind,
};

export function WeatherBanner({ weather, city }: WeatherBannerProps) {
  const WeatherIcon = WEATHER_ICONS[weather.icon] ?? Cloud;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3"
    >
      <WeatherIcon className="w-8 h-8 text-primary" />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-foreground">
            {weather.temp}°C
          </span>
          <span className="text-sm text-muted-foreground capitalize">
            {weather.description}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{city}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Droplets className="w-3 h-3" />
          {weather.humidity}%
        </span>
        <span className="flex items-center gap-1">
          <Wind className="w-3 h-3" />
          {weather.windSpeed}m/s
        </span>
      </div>
    </motion.div>
  );
}
