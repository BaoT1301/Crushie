"use client";

import { motion } from "framer-motion";
import { HeartIcon } from "@/components/love-animations";

/**
 * The logo moment.
 *
 * This is the signature of the whole page, so it gets a real motion budget
 * while everything around it stays quiet. Four things happen, in order:
 *
 *   1. the mark springs in from scale 0 with a -180deg overshoot
 *   2. a rose halo blooms behind it and keeps breathing
 *   3. six sparkles orbit outward on a loop
 *   4. the heart inside keeps a slow double beat
 *
 * The spring is unchanged from the original page (stiffness 150, damping 12),
 * because that snap and settle was already tuned correctly.
 *
 * Element budget: 1 mark, 2 halos, 6 sparkles, 1 heart. Nine animated nodes,
 * all on transform and opacity, all concentrated in one place the eye is
 * already looking. That is the opposite of the previous approach, which spread
 * 67 animated nodes across the whole page and made none of them feel special.
 *
 * MotionConfig reducedMotion="user" in the root layout collapses all of it.
 */

const SPARKLES = 6;

export function LogoMoment() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 150, damping: 12, duration: 1.2 }}
      className="relative flex h-24 w-24 items-center justify-center"
    >
      {/* Halo. Two blurred rose fields at different scales so the bloom has
          depth instead of reading as a flat glow. */}
      <motion.span
        aria-hidden
        className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl"
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.12, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="absolute -inset-16 rounded-full bg-pink-400/10 blur-[80px]"
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Sparkles orbiting outward. */}
      {Array.from({ length: SPARKLES }).map((_, i) => {
        const angle = (i * Math.PI * 2) / SPARKLES;
        return (
          <motion.span
            aria-hidden
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-primary"
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              x: [0, Math.cos(angle) * 46],
              y: [0, Math.sin(angle) * 46],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeOut",
            }}
          />
        );
      })}

      {/* The mark. Tilts and lifts on hover so it feels like an object. */}
      <motion.span
        whileHover={{ scale: 1.08, rotate: -6 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 16 }}
        className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary via-pink-500 to-rose-500 shadow-2xl shadow-primary/40"
      >
        <motion.span
          animate={{ scale: [1, 1.18, 1, 1.12, 1] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.15, 0.3, 0.45, 1],
          }}
        >
          <HeartIcon className="h-12 w-12 text-white" />
        </motion.span>
      </motion.span>
    </motion.div>
  );
}
