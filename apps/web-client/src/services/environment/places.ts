import { logger } from "@/lib/logger";
/**
 * Places Service — Google Places API integration
 *
 * Fetches nearby places for a given lat/lng using Google Places Nearby Search.
 * Returns top 5 date-friendly spots with Google Static Maps thumbnails.
 *
 * Env: GOOGLE_MAPS_API_KEY (placeholder — user will add key later)
 */

export interface PlaceResult {
  name: string;
  placeId: string;
  vicinity: string;
  rating?: number;
  types: string[];
  staticMapUrl?: string;
  lat?: number;
  lng?: number;
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const PLACES_BASE =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const STATIC_MAP_BASE = "https://maps.googleapis.com/maps/api/staticmap";

/** Date-friendly place types for the Nearby Search */
const DATE_FRIENDLY_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "park",
  "museum",
  "art_gallery",
  "movie_theater",
  "bowling_alley",
  "amusement_park",
];

/**
 * Build a Google Static Maps URL for a given lat/lng.
 * Uses roadmap style with a marker — cheap and effective.
 */
function buildStaticMapUrl(lat: number, lng: number): string {
  if (!GOOGLE_MAPS_API_KEY) return "";
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "15",
    size: "400x200",
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lng}`,
    key: GOOGLE_MAPS_API_KEY,
  });
  return `${STATIC_MAP_BASE}?${params.toString()}`;
}

/**
 * Fetch nearby date-friendly places from Google Places API.
 * Returns null if API key is missing or the request fails (graceful degradation).
 */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
): Promise<PlaceResult[] | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    logger.warn("GOOGLE_MAPS_API_KEY not set — skipping places fetch");
    return null;
  }

  try {
    // Search for date-friendly places within 2km
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: "2000",
      type: DATE_FRIENDLY_TYPES.join("|"),
      key: GOOGLE_MAPS_API_KEY,
    });

    const url = `${PLACES_BASE}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) {
      logger.error(`❌ Google Places API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      results: Array<{
        name: string;
        place_id: string;
        vicinity: string;
        rating?: number;
        types: string[];
        geometry: { location: { lat: number; lng: number } };
      }>;
    };

    // Take top 5 results, map to our schema
    return json.results.slice(0, 5).map((place) => ({
      name: place.name,
      placeId: place.place_id,
      vicinity: place.vicinity,
      rating: place.rating,
      types: place.types,
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      staticMapUrl: buildStaticMapUrl(
        place.geometry.location.lat,
        place.geometry.location.lng,
      ),
    }));
  } catch (error) {
    logger.error("Places fetch failed", error);
    return null;
  }
}
