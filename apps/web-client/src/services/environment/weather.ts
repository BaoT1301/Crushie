import { logger } from "@/lib/logger";
/**
 * Weather Service — OpenWeather Current Weather 2.5 API integration
 *
 * Fetches current weather conditions for a given lat/lng using the
 * free-tier Current Weather endpoint (/data/2.5/weather).
 *
 * City name is included directly in the 2.5 response (`name` field).
 *
 * @see https://openweathermap.org/current
 * Env: OPENWEATHER_API_KEY
 */

export interface WeatherData {
  temp: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  cityName: string;
}

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
const WEATHER_BASE = "https://api.openweathermap.org/data/2.5/weather";

/** Current Weather 2.5 response shape */
interface CurrentWeatherResponse {
  name: string;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  wind: {
    speed: number;
  };
  weather: Array<{ description: string; icon: string }>;
}

/**
 * Fetch current weather from OpenWeather 2.5 API (free tier).
 * Returns null if API key is missing or the request fails (graceful degradation).
 */
export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherData | null> {
  if (!OPENWEATHER_API_KEY) {
    logger.warn("OPENWEATHER_API_KEY not set — skipping weather fetch");
    return null;
  }

  try {
    const url = `${WEATHER_BASE}?lat=${lat}&lon=${lng}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      logger.error(`❌ OpenWeather 2.5 returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as CurrentWeatherResponse;

    return {
      temp: Math.round(json.main.temp),
      feelsLike: Math.round(json.main.feels_like),
      description: json.weather[0]?.description ?? "unknown",
      icon: json.weather[0]?.icon ?? "01d",
      humidity: json.main.humidity,
      windSpeed: json.wind.speed,
      cityName: json.name || "Unknown",
    };
  } catch (error) {
    logger.error("Weather fetch failed", error);
    return null;
  }
}
