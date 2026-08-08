"use client";

import { Eye, MessageCircle, Sparkles, TreePine, Brain } from "lucide-react";
import type { ContextEntry, GlassesTheme } from "../types";

const ICON_MAP: Record<ContextEntry["type"], typeof Eye> = {
  environment: TreePine,
  speech: MessageCircle,
  visual_cue: Eye,
  analysis: Brain,
  emotion: Sparkles,
};

const LABEL_MAP: Record<ContextEntry["type"], string> = {
  environment: "ENV",
  speech: "SPEECH",
  visual_cue: "CUE",
  analysis: "AI",
  emotion: "EMO",
};

/**
 * ContextPanel — Displays a live scrolling feed of context captured
 * from the environment, the other person's speech, visual cues,
 * and analysis results. Positioned left-center in the HUD.
 *
 * Uses gradient-mask for soft fade-in/out — no overflow-hidden.
 */
export function ContextPanel({
  entries,
  theme,
}: {
  entries: ContextEntry[];
  theme: GlassesTheme;
}) {
  // Show last 6 entries
  const visible = entries.slice(-6);

  return (
    <div
      className={`flex w-full flex-col gap-0.5 rounded-md ${theme.border} border ${theme.panelBg} px-2 py-1.5 backdrop-blur-md`}
      style={{
        // Width is set by the positioning wrapper in hud-overlay.tsx; see the
        // note there. A percentage here collapsed the panel to ~64px.
        willChange: "transform",
        transform: "translateZ(0)",
        filter: `drop-shadow(0 0 6px ${theme.glow})`,
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 8%, black 90%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 8%, black 90%, transparent 100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Eye
          className={`h-2 w-2 ${theme.accent}`}
          style={{ filter: `drop-shadow(0 0 3px ${theme.glow})` }}
        />
        <span
          className={`font-mono text-[6px] uppercase tracking-[0.2em] ${theme.textDim}`}
        >
          Context Feed
        </span>
      </div>

      {/* Entries */}
      {visible.length === 0 ? (
        <p className={`font-mono text-[7px] italic ${theme.textDim}`}>
          Awaiting context...
        </p>
      ) : (
        visible.map((entry) => {
          const Icon = ICON_MAP[entry.type] ?? Eye;
          return (
            <div
              key={entry.id}
              className="flex items-start gap-1"
              style={{ animation: "ctx-slide-in 0.3s ease-out" }}
            >
              <Icon
                className={`mt-px h-2 w-2 shrink-0 ${theme.accent}`}
                style={{ filter: `drop-shadow(0 0 2px ${theme.glow})` }}
              />
              <div className="min-w-0 flex-1">
                <span
                  className={`font-mono text-[6px] uppercase tracking-wider ${theme.textDim}`}
                >
                  {LABEL_MAP[entry.type]}
                </span>
                <p
                  className={`font-mono text-[8px] leading-tight ${theme.text} truncate`}
                  style={{ textShadow: `0 0 4px ${theme.glow}` }}
                  title={entry.value}
                >
                  {entry.value}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
