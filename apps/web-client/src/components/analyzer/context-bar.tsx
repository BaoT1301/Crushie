"use client";

import { motion } from "framer-motion";
import { MapPin, Thermometer, Clock, Wind } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { WeatherContext } from "@/types/analyzer";

// ============================================================================
// Types
// ============================================================================

interface ContextBarProps {
  weather?: WeatherContext;
  city?: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ContextBar({ weather, city, className }: ContextBarProps) {
  if (!weather && !city) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <GlassCard variant="subtle" className="px-4 py-2.5">
        <div className="flex items-center gap-3 md:gap-4 flex-wrap font-mono text-[11px] md:text-xs tracking-wider uppercase text-muted-foreground">
          {city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-primary" />
              <span className="text-foreground font-medium">{city}</span>
            </span>
          )}

          {weather && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <Thermometer className="w-3 h-3 text-primary" />
                <span>{Math.round(weather.temp)}°C</span>
              </span>

              <span className="text-border">|</span>
              <span className="capitalize">{weather.description}</span>

              <span className="hidden sm:inline text-border">|</span>
              <span className="hidden sm:flex items-center gap-1.5">
                <Wind className="w-3 h-3" />
                <span>{Math.round(weather.windSpeed)} m/s</span>
              </span>
            </>
          )}

          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>{timeStr}</span>
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
}
