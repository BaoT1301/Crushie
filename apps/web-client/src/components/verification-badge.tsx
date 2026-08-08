"use client";

import { cn } from "@/lib/utils";
import { ShieldCheck, Sparkles } from "lucide-react";

type VerificationBadgeProps = {
  isVerified: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function VerificationBadge({
  isVerified,
  size = "sm",
  className,
}: VerificationBadgeProps) {
  if (!isVerified) return null;

  return (
    <span
      title="Pinky Promise Verified"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
    >
      <ShieldCheck className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      <Sparkles className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      <span>Pinky Promise</span>
    </span>
  );
}
