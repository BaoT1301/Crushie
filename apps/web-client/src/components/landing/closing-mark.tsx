"use client";

import { motion } from "framer-motion";
import { HeartIcon } from "@/components/love-animations";

/**
 * Closing mark.
 *
 * The page opened with LogoMoment: spring entrance, breathing halo, orbiting
 * sparkles, heartbeat. It closed with a bare h2 and a button. That asymmetry
 * was the sharpest alive-to-dead transition on the page, and it landed on the
 * last thing a visitor sees before deciding.
 *
 * This reprises the hero's own motif at a smaller scale rather than
 * introducing new imagery. Deliberately no sparkle orbit: that stays exclusive
 * to the hero so the opening keeps something the rest of the page does not.
 */
export function ClosingMark() {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <motion.span
        aria-hidden
        className="absolute -inset-6 rounded-full bg-primary/25 blur-2xl"
        animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        whileHover={{ scale: 1.08, rotate: -6 }}
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-pink-500 to-rose-500 shadow-[0_6px_20px_-4px_rgba(244,114,182,0.4),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.28)]"
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
          <HeartIcon className="h-8 w-8 text-white" />
        </motion.span>
      </motion.span>
    </div>
  );
}
