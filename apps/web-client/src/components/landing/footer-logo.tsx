"use client";

import { motion } from "framer-motion";
import { HeartIcon } from "@/components/love-animations";

/**
 * Footer logo mark.
 *
 * Its own client island so the footer itself can stay a server component.
 *
 * The spring matches LogoMoment in the hero (stiffness 320, damping 16), so the
 * mark reacts identically wherever it appears. Square with the same rounded-xl
 * corners as the nav mark rather than a circle, and white rather than pink, so
 * all three logos on the page read as the same object.
 *
 * The heart keeps its slow beat via .animate-heartbeat, which is already gated
 * behind prefers-reduced-motion in globals.css.
 */
export function FooterLogo() {
  return (
    <motion.span
      whileHover={{ scale: 1.1, rotate: -8 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 16 }}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[9px] bg-white shadow-sm"
    >
      <HeartIcon className="animate-heartbeat h-4 w-4 text-background" />
    </motion.span>
  );
}
