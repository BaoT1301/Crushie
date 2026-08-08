"use client";

import { MapPin, Star, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import type { NearbyPlace } from "@/types/analyzer";

interface PlacePostcardProps {
  place: NearbyPlace;
  index?: number;
}

export function PlacePostcard({ place, index = 0 }: PlacePostcardProps) {
  // Format types into a readable label
  const formattedType = place.types
    .filter(
      (t) =>
        !["point_of_interest", "establishment", "food", "store"].includes(t),
    )
    .slice(0, 2)
    .map((t) => t.replace(/_/g, " "))
    .join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        {/* Static map thumbnail */}
        {place.staticMapUrl && (
          <div className="relative h-24 bg-muted">
            <img
              src={place.staticMapUrl}
              alt={`Map of ${place.name}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        <CardContent className="p-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium text-foreground leading-tight truncate">
              {place.name}
            </h4>
            {place.rating && (
              <span className="flex items-center gap-0.5 text-xs text-primary shrink-0">
                <Star className="w-3 h-3 fill-current" />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{place.vicinity}</span>
          </div>

          {formattedType && (
            <p className="text-xs text-muted-foreground capitalize">
              {formattedType}
            </p>
          )}

          {place.placeId && (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${place.placeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" />
              View on Maps
            </a>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
