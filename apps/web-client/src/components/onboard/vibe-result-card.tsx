"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, RotateCcw, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EnergyBadge } from "./energy-badge";
import type { VibeProfileResult } from "@/types/vibe-onboard";

interface VibeResultCardProps {
  profile: VibeProfileResult;
  onReset?: () => void;
  onContinue?: () => void;
}

// ── Confetti launcher (lazy-loaded) ─────────────────────────────────

function useConfetti() {
  const firedRef = useRef(false);

  const fire = useCallback(async () => {
    if (firedRef.current) return;
    firedRef.current = true;

    const confetti = (await import("canvas-confetti")).default;

    // Heart-shaped burst from center
    const heart = confetti.shapeFromPath({
      path: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    });

    // Fire multiple bursts
    const defaults = {
      spread: 360,
      ticks: 80,
      gravity: 0.4,
      decay: 0.94,
      startVelocity: 20,
      shapes: [heart],
      colors: ["#e63972", "#f472b6", "#fce4ec"],
      scalar: 2,
    };

    confetti({ ...defaults, particleCount: 30, origin: { x: 0.5, y: 0.35 } });

    setTimeout(() => {
      confetti({ ...defaults, particleCount: 20, origin: { x: 0.3, y: 0.4 } });
      confetti({ ...defaults, particleCount: 20, origin: { x: 0.7, y: 0.4 } });
    }, 200);

    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 15,
        spread: 120,
        origin: { x: 0.5, y: 0.5 },
        scalar: 1.5,
      });
    }, 500);
  }, []);

  return { fire };
}

// ── Animation variants ──────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  reveal: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.8 },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 20 },
  reveal: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 20 },
  },
};

const tagContainerVariants = {
  hidden: {},
  reveal: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};

const tagVariants = {
  hidden: { opacity: 0, scale: 0.6 },
  reveal: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  },
};

// ============================================================================
// Component
// ============================================================================

export function VibeResultCard({
  profile,
  onReset,
  onContinue,
}: VibeResultCardProps) {
  const { fire: fireConfetti } = useConfetti();

  useEffect(() => {
    fireConfetti();
  }, [fireConfetti]);

  return (
    <div className="max-w-3xl mx-auto relative">
      {/* ── Phase 1: Heartbeat intro ───────────────────────────── */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex justify-center mb-6"
      >
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.15, 1, 1.1, 1] }}
            transition={{ duration: 1.2, repeat: 2, ease: "easeInOut" }}
          >
            <Heart className="w-16 h-16 text-primary fill-primary drop-shadow-[0_0_15px_rgba(230,57,114,0.4)]" />
          </motion.div>
          {/* Glow ring */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: [0, 0.4, 0] }}
            transition={{ duration: 1, repeat: 2, ease: "easeOut" }}
            className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
          />
        </div>
      </motion.div>

      {/* ── Phase 2: Vibe label reveal ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          delay: 0.5,
          duration: 0.6,
          type: "spring",
          stiffness: 150,
        }}
        className="text-center mb-8"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-3"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Your Vibe Has Been Revealed</span>
          <Sparkles className="w-4 h-4 text-primary" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring", stiffness: 150 }}
          className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-foreground"
        >
          {profile.vibeName}
        </motion.h2>
      </motion.div>

      {/* ── Phase 3: Full card reveal ──────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="reveal"
      >
        <GlassCard
          variant="strong"
          glowColor="rose"
          className="overflow-hidden border-primary/20"
        >
          {/* Gold shimmer top border */}
          <div className="h-1 bg-linear-to-r from-transparent via-primary/50 to-transparent" />

          <div className="p-6 md:p-8 space-y-6">
            {/* Summary */}
            {profile.vibeSummary && (
              <motion.p
                variants={childVariants}
                className="text-foreground/80 text-base md:text-lg leading-relaxed text-center max-w-lg mx-auto"
              >
                {profile.vibeSummary}
              </motion.p>
            )}

            {/* Energy badge */}
            <motion.div
              variants={childVariants}
              className="flex justify-center"
            >
              <div className="relative">
                <EnergyBadge energy={profile.energy} size="lg" />
                {/* Glow ring behind badge */}
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute inset-0 -m-2 rounded-full bg-primary/10 blur-md -z-10"
                />
              </div>
            </motion.div>

            {/* Tags grid */}
            <div className="space-y-4">
              {/* Mood Tags */}
              {profile.moodTags && profile.moodTags.length > 0 && (
                <motion.div variants={childVariants}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>🎭</span> Mood
                  </p>
                  <motion.div
                    variants={tagContainerVariants}
                    initial="hidden"
                    animate="reveal"
                    className="flex flex-wrap gap-1.5"
                  >
                    {profile.moodTags.map((tag) => (
                      <motion.span
                        key={tag}
                        variants={tagVariants}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary/50 text-secondary-foreground border border-border will-change-transform"
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Style Tags */}
              {profile.styleTags && profile.styleTags.length > 0 && (
                <motion.div variants={childVariants}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>👗</span> Style
                  </p>
                  <motion.div
                    variants={tagContainerVariants}
                    initial="hidden"
                    animate="reveal"
                    className="flex flex-wrap gap-1.5"
                  >
                    {profile.styleTags.map((tag) => (
                      <motion.span
                        key={tag}
                        variants={tagVariants}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent/50 text-accent-foreground border border-border will-change-transform"
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* Interest Tags */}
              {profile.interestTags && profile.interestTags.length > 0 && (
                <motion.div variants={childVariants}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>💡</span> Interests
                  </p>
                  <motion.div
                    variants={tagContainerVariants}
                    initial="hidden"
                    animate="reveal"
                    className="flex flex-wrap gap-1.5"
                  >
                    {profile.interestTags.map((tag) => (
                      <motion.span
                        key={tag}
                        variants={tagVariants}
                        className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-foreground border border-primary/20 will-change-transform"
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </div>

            {/* Action buttons */}
            <motion.div
              variants={childVariants}
              className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/50"
            >
              {onContinue && (
                <Button
                  onClick={onContinue}
                  size="lg"
                  className="flex-1 py-5 text-base group bg-linear-to-r bg-primary hover:bg-primary/90"
                >
                  Continue to Dashboard
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              )}
              {onReset && (
                <Button
                  onClick={onReset}
                  variant="outline"
                  size="lg"
                  className="py-5 text-base gap-2 border-border/50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Regenerate
                </Button>
              )}
            </motion.div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
