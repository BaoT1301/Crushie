"use client";

import { cn } from "@/lib/utils";
import { ENERGY_CONFIG, type VibeEnergy } from "@/types/vibe-onboard";

interface EnergyBadgeProps {
  energy: VibeEnergy;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EnergyBadge({
  energy,
  size = "md",
  className,
}: EnergyBadgeProps) {
  const config = ENERGY_CONFIG[energy];

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1",
    md: "px-3.5 py-1.5 text-sm gap-1.5",
    lg: "px-4 py-2 text-base gap-2",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        config.bg,
        config.border,
        sizeClasses[size],
        className,
      )}
    >
      <span>{config.emoji}</span>
      <span
        className={cn(
          "text-foreground",
          config.gradient,
        )}
      >
        {config.label}
      </span>
    </span>
  );
}
