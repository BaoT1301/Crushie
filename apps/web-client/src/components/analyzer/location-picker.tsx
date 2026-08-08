"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Loader2, X, Search, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocationInput } from "@/types/analyzer";

interface LocationPickerProps {
  location: LocationInput | null;
  onLocationChange: (location: LocationInput | null) => void;
  disabled?: boolean;
}

export function LocationPicker({
  location,
  onLocationChange,
  disabled,
}: LocationPickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // City search query
  const citiesQuery = useQuery({
    ...trpc.environment.searchCities.queryOptions({
      query: debouncedQuery,
    }),
    enabled: debouncedQuery.length >= 2,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle selecting a city from autocomplete
  const handleCitySelect = useCallback(
    async (placeId: string, cityName: string) => {
      setIsGeocoding(true);
      setShowDropdown(false);
      setSearchQuery(cityName);
      setError(null);

      try {
        const data = await queryClient.fetchQuery(
          trpc.environment.geocodeCity.queryOptions({ placeId }),
        );
        const loc = data?.location;

        if (loc) {
          onLocationChange({
            lat: loc.lat,
            lng: loc.lng,
            cityName,
          });
        } else {
          setError("Could not resolve city location");
        }
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? ((err as { message?: unknown }).message ??
                (err as { error?: unknown }).error)
              : null;

        setError(
          typeof errorMessage === "string" && errorMessage.trim().length > 0
            ? errorMessage
            : "Failed to geocode city",
        );
      } finally {
        setIsGeocoding(false);
      }
    },
    [onLocationChange, queryClient, trpc.environment.geocodeCity],
  );

  // Handle browser geolocation
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onLocationChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setSearchQuery("");
        setIsLoading(false);
      },
      (err) => {
        setIsLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location access denied");
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Location unavailable");
            break;
          case err.TIMEOUT:
            setError("Location request timed out");
            break;
          default:
            setError("Failed to get location");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const handleClear = () => {
    onLocationChange(null);
    setError(null);
    setSearchQuery("");
  };

  const suggestions = citiesQuery.data?.suggestions ?? [];
  const displayLabel =
    location?.cityName ?? (location ? "Location shared" : null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
        <MapPin className="w-4 h-4 text-primary" />
        <span>Location</span>
        <span className="text-muted-foreground font-normal">(optional)</span>
      </div>

      <AnimatePresence mode="wait">
        {location ? (
          /* ── Active location pill ── */
          <motion.div
            key="active"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2"
          >
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-sm text-primary">
              <MapPin className="w-3.5 h-3.5" />
              <span>{displayLabel}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClear}
              disabled={disabled}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </motion.div>
        ) : (
          /* ── Location input mode ── */
          <motion.div
            key="input"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="space-y-2"
          >
            {/* City search + GPS button row */}
            <div className="flex gap-2">
              <div className="relative flex-1" ref={dropdownRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search city or state..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                    setError(null);
                  }}
                  onFocus={() => {
                    if (searchQuery.length >= 2) setShowDropdown(true);
                  }}
                  disabled={disabled || isGeocoding}
                  className="pl-9 pr-3"
                />

                {/* Autocomplete dropdown */}
                {showDropdown && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden"
                  >
                    {suggestions.map((city) => (
                      <button
                        key={city.placeId}
                        onClick={() =>
                          handleCitySelect(city.placeId, city.mainText)
                        }
                        className="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors flex items-start gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-sm font-medium">
                            {city.mainText}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {city.secondaryText}
                          </div>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}

                {/* Loading indicator for autocomplete */}
                {showDropdown &&
                  debouncedQuery.length >= 2 &&
                  citiesQuery.isLoading && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Searching cities...
                      </div>
                    </div>
                  )}
              </div>

              {/* GPS button */}
              <Button
                variant="outline"
                size="icon"
                onClick={handleGetLocation}
                disabled={disabled || isLoading || isGeocoding}
                title="Use current location"
                className="shrink-0 h-9 w-9"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Geocoding loading state */}
      {isGeocoding && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Resolving location...
        </motion.p>
      )}

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-destructive"
        >
          {error}
        </motion.p>
      )}

      {/* Helper text */}
      {!location && !error && !isGeocoding && (
        <p className="text-xs text-muted-foreground">
          Search a city or use GPS — enables weather-aware date ideas &amp;
          nearby venue suggestions
        </p>
      )}
    </div>
  );
}
