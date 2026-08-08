"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface GlassCardProps extends HTMLMotionProps<"div"> {
  /** Intensity of the glass effect */
  variant?: "subtle" | "medium" | "strong";
  /** Optional animated gradient glow border color */
  glowColor?: "rose" | "gold" | "blue" | "none";
}

// ============================================================================
// Variant Config
// ============================================================================

const VARIANT_CLASSES = {
  subtle:
    "backdrop-blur-md bg-white/[0.03] border border-white/[0.06] shadow-lg",
  medium:
    "backdrop-blur-xl bg-white/[0.06] border border-white/[0.1] shadow-xl",
  strong:
    "backdrop-blur-2xl bg-white/[0.1] border border-white/[0.15] shadow-2xl",
} as const;

const GLOW_CLASSES = {
  rose: "animate-glow-pulse",
  gold: "shadow-[0_0_30px_rgba(212,175,55,0.15)]",
  blue: "shadow-[0_0_30px_rgba(59,130,246,0.15)]",
  none: "",
} as const;

// ============================================================================
// GlassCard Component
// ============================================================================

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    {
      variant = "medium",
      glowColor = "none",
      className,
      children,
      ...motionProps
    },
    ref,
  ) {
    return (
      <motion.div
        ref={ref}
        className={cn(
          "rounded-2xl will-change-transform",
          VARIANT_CLASSES[variant as keyof typeof VARIANT_CLASSES],
          GLOW_CLASSES[glowColor as keyof typeof GLOW_CLASSES],
          className,
        )}
        {...motionProps}
      >
        {children}
      </motion.div>
    );
  },
);

// ============================================================================
// GradientMask — Anti-clutter scroll fade
// ============================================================================

interface GradientMaskProps {
  children: ReactNode;
  className?: string;
  /** Direction of the fade */
  direction?: "bottom" | "top" | "both";
}

