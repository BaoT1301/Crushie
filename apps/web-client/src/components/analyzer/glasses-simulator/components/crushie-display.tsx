"use client";

import { Loader2 } from "lucide-react";
import type { GlassesTheme } from "../types";

/**
 * CrushieDisplay — The floating side-prism panel showing AI coaching suggestions.
 *
 * Uses gradient-mask fade instead of overflow-hidden so text floats
 * in space rather than being hard-clipped.
 */
export function CrushieDisplay({
  suggestion,
  visualCue,
  isPending,
  theme,
  languageFlag,
}: {
  suggestion: string;
  visualCue: string;
  isPending: boolean;
  theme: GlassesTheme;
  languageFlag: string;
}) {
  return (
    <div
      className={`pointer-events-none flex w-full flex-col gap-1 rounded-lg ${theme.border} border ${theme.panelBg} px-2.5 py-2 backdrop-blur-md`}
      style={{
        // Width is set by the positioning wrapper in hud-overlay.tsx. A
        // percentage here resolved against that shrink-to-fit wrapper instead
        // of the lens and collapsed the panel to a single-word column.
        willChange: "transform",
        transform: "translateZ(0)",
        filter: `drop-shadow(0 0 8px ${theme.glow})`,
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-mono text-[7px] uppercase tracking-[0.18em] ${theme.textDim}`}
        >
          {languageFlag} Crushie
        </span>
        {isPending && (
          <Loader2 className={`h-2.5 w-2.5 animate-spin ${theme.accent}`} />
        )}
      </div>

      {/* Suggestion — gradient-mask, NO overflow-hidden */}
      <div
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 6%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 6%, black 88%, transparent 100%)",
        }}
      >
        <p
          className={`font-mono text-[10px] leading-relaxed ${theme.text}`}
          style={{ textShadow: `0 0 8px ${theme.glow}` }}
        >
          {suggestion}
        </p>
      </div>

      {/* Visual cue */}
      <p
        className={`font-mono text-[7px] uppercase tracking-widest ${theme.textDim}`}
      >
        cue: {visualCue}
      </p>
    </div>
  );
}
