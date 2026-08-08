"use client";

import { motion } from "framer-motion";
import { Map, Navigation } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { DateSuggestion } from "@/types/analyzer";

interface MissionMapProps {
  missions: DateSuggestion[];
  /** User's current location — shown as a "You are here" pin */
  userLocation?: { lat: number; lng: number } | null;
}

const MARKER_COLORS = ["red", "blue", "green", "purple", "orange"] as const;

/**
 * Build a Google Static Maps URL with multiple labeled markers for each mission
 * that has lat/lng coordinates, plus a "You are here" marker for the user.
 */
function buildMissionMapUrl(
  missions: DateSuggestion[],
  userLocation?: { lat: number; lng: number } | null,
): string | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return null;

  const missionsWithCoords = missions.filter(
    (m) => m.lat != null && m.lng != null,
  );

  if (missionsWithCoords.length === 0 && !userLocation) return null;

  const params = new URLSearchParams({
    size: "800x400",
    scale: "2",
    maptype: "roadmap",
    key: apiKey,
  });

  // Add user location marker
  if (userLocation) {
    params.append(
      "markers",
      `color:0x10B981|label:★|${userLocation.lat},${userLocation.lng}`,
    );
  }

  // Add mission markers with labels 1, 2, 3...
  missionsWithCoords.forEach((mission, i) => {
    const color = MARKER_COLORS[i % MARKER_COLORS.length];
    params.append(
      "markers",
      `color:${color}|label:${i + 1}|${mission.lat},${mission.lng}`,
    );
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function MissionMap({ missions, userLocation }: MissionMapProps) {
  const mapUrl = buildMissionMapUrl(missions, userLocation);

  // Don't render if no pins to show
  if (!mapUrl) return null;

  const missionsWithCoords = missions.filter(
    (m) => m.lat != null && m.lng != null,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
    >
      <Card className="backdrop-blur-xl shadow-lg overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Map className="w-5 h-5 text-primary" />
            <span>Mission Map</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Map Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="relative"
          >
            <img
              src={mapUrl}
              alt="Mission locations map"
              className="w-full h-auto rounded-b-lg"
              loading="lazy"
            />
            {/* Gradient overlay at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-card to-transparent" />
          </motion.div>

          {/* Legend */}
          <div className="px-5 py-4 space-y-2">
            {userLocation && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Navigation className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary font-medium">★</span>
                <span>You are here</span>
              </motion.div>
            )}
            {missionsWithCoords.map((mission, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 + i * 0.05 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {i + 1}
                </span>
                <span className="truncate">
                  {mission.placeName || mission.title}
                </span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
