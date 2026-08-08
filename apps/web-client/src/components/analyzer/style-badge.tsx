"use client";

import { motion } from "framer-motion";
import { STYLE_CONFIG, type PredictedStyle } from "@/types/analyzer";

interface StyleBadgeProps {
  style: PredictedStyle;
}

export function StyleBadge({ style }: StyleBadgeProps) {
  const config = STYLE_CONFIG[style];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="text-center"
    >
      <div className="inline-flex items-center gap-3 bg-card backdrop-blur-xl border border-border rounded-full px-8 py-4 shadow-lg">
        <span className="text-4xl">{config.emoji}</span>
        <div className="text-left">
          <p className="text-muted-foreground text-sm">Communication Style</p>
          <p
            className={"text-2xl font-bold text-primary capitalize"}
          >
            {style}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
