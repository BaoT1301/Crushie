"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// Floating Hearts — Animated hearts rising and fading
// ============================================================================

/**
 * Deterministic pseudo-random from an index.
 *
 * Math.random() during render produces different values on the server and the
 * client, which React reports as "A tree hydrated but some attributes of the
 * server rendered HTML didn't match the client properties." Seeding from the
 * item index keeps the variation while making both renders agree.
 */
function seeded(i: number, salt = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * salt) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Round a value before it reaches an inline style.
 *
 * Seeding alone does not remove the hydration warning. The server writes the
 * full double (`rotate(-13.283454919292126deg)`), the browser parses it into
 * the CSSOM and serialises it back at 6 significant figures
 * (`rotate(-13.2835deg)`), and React compares its own string against that
 * round-tripped one and reports a mismatch. Emitting a value that already
 * survives the round trip is what makes both renders agree — keep the rounding.
 */
function styleFloat(n: number): number {
  return Number(n.toFixed(3));
}

const heartVariants: Variants = {
  initial: (i: number) => ({
    opacity: 0,
    y: 0,
    x: 0,
    scale: 0.5,
    rotate: styleFloat(-15 + seeded(i) * 30),
  }),
  animate: (i: number) => ({
    opacity: [0, 1, 1, 0],
    y: [0, -60, -120, -180],
    x: [0, styleFloat((i % 2 === 0 ? 1 : -1) * (10 + seeded(i, 2) * 20)), 0],
    scale: [0.5, 1, 0.8, 0.3],
    rotate: [-15 + i * 10, 15 - i * 5, -10 + i * 3],
    transition: {
      duration: 3 + i * 0.5,
      repeat: Infinity,
      delay: i * 0.6,
      ease: "easeOut",
    },
  }),
};

// Heart SVG path for consistent use
function HeartIcon({
  className,
  fill = "currentColor",
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

// ============================================================================
// Floating Hearts Background
// ============================================================================

export function FloatingHearts({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          custom={i}
          variants={heartVariants}
          initial="initial"
          animate="animate"
          className="absolute text-primary/30"
          style={{
            // See styleFloat: `${(6 * 70) / 6}%` is 26.666666666666664%, which
            // the browser hands back as 26.6667% and React flags as a mismatch.
            left: `${styleFloat(15 + (i * 70) / count)}%`,
            bottom: "10%",
          }}
        >
          <HeartIcon className="h-5 w-5" />
        </motion.div>
      ))}
    </div>
  );
}

export { HeartIcon };
