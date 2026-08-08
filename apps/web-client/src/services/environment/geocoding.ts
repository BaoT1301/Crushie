import { logger } from "@/lib/logger";
/**
 * Geocoding Service — Google Places Autocomplete & Geocoding API
 *
 * Provides city search (autocomplete) and placeId → lat/lng resolution.
 * Used by the LocationPicker component for city/state selection.
 *
 * @see https://developers.google.com/maps/documentation/places/web-service/autocomplete
 * @see https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 * Env: GOOGLE_MAPS_API_KEY
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const AUTOCOMPLETE_BASE =
  "https://places.googleapis.com/v1/places:autocomplete";
const GEOCODING_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

export interface CitySuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
}

export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Search for cities matching a query string.
 * Uses Google Places Autocomplete (New) restricted to cities only.
 */
export async function searchCities(query: string): Promise<CitySuggestion[]> {
  if (!GOOGLE_MAPS_API_KEY || !query || query.length < 2) return [];

  try {
    const res = await fetch(AUTOCOMPLETE_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["(cities)"],
        languageCode: "en",
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      logger.error(`❌ Places Autocomplete returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text: { text: string };
          structuredFormat: {
            mainText: { text: string };
            secondaryText: { text: string };
          };
        };
      }>;
    };

    return (json.suggestions ?? [])
      .filter((s) => s.placePrediction != null)
      .map((s) => ({
        placeId: s.placePrediction!.placeId,
        mainText: s.placePrediction!.structuredFormat.mainText.text,
        secondaryText: s.placePrediction!.structuredFormat.secondaryText.text,
        fullText: s.placePrediction!.text.text,
      }))
      .slice(0, 5);
  } catch (error) {
    logger.error("City search failed", error);
    return [];
  }
}

/**
 * Resolve a Google Place ID to lat/lng coordinates using the Geocoding API.
 */
export async function geocodePlace(
  placeId: string,
): Promise<GeocodedLocation | null> {
  if (!GOOGLE_MAPS_API_KEY || !placeId) return null;

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
    });

    const res = await fetch(`${GEOCODING_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      logger.error(`❌ Geocoding API returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
    };

    const result = json.results[0];
    if (!result) return null;

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  } catch (error) {
    logger.error("Geocoding failed", error);
    return null;
  }
}
