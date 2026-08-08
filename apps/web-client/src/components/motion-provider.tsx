"use client";

import { MotionConfig } from "framer-motion";

/**
 * Applies the user's OS-level motion preference to every Motion animation in
 * the tree.
 *
 * `reducedMotion="user"` strips transform and layout animation while leaving
 * opacity and color transitions intact. That matches MDN's guidance that
 * "reduce" should minimize non-essential motion rather than remove all
 * feedback, and it covers the vestibular trigger categories (parallax, large
 * scaling, continuous rotation) without making the UI feel broken.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
