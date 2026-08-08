"use client";

import { Battery, Wifi, Signal } from "lucide-react";
import type {
  GlassesConfig,
  GlassesTheme,
  GlassesFrameType,
  LanguageOption,
  ContextEntry,
} from "../types";
import { AudioWaveform } from "./audio-waveform";
import { DiagnosticLog } from "./diagnostic-log";
import { LanguagePicker } from "./language-picker";
import { CrushieDisplay } from "./crushie-display";
import { ContextPanel } from "./context-panel";

interface HudOverlayProps {
  config: GlassesConfig;
  theme: GlassesTheme;
  frameType: GlassesFrameType;
  clockStr: string;
  nightVision: boolean;
  language: LanguageOption;
  languages: LanguageOption[];
  onLanguageChange: (lang: LanguageOption) => void;
  suggestion: string;
  visualCue: string;
  isPending: boolean;
  isListening: boolean;
  voiceInput: string;
  diagnosticLog: string[];
  contextEntries: ContextEntry[];
  confidence: number;
  targetVibe: string;
  screenshotFlash: boolean;
}

export function HudOverlay({
  config,
  theme,
  frameType,
  clockStr,
  nightVision,
  language,
  languages,
  onLanguageChange,
  suggestion,
  visualCue,
  isPending,
  isListening,
  voiceInput,
  diagnosticLog: diagLog,
  contextEntries,
  confidence,
  targetVibe,
  screenshotFlash,
}: HudOverlayProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${theme.hudClass}`}
      style={{
        animation: "hud-flicker 3s ease-in-out infinite",
        fontFamily:
          'ui-monospace, "JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
      }}
    >
      {/* ── TOP-LEFT: Status bar ── */}
      <div className="absolute left-[8%] top-[8%] flex items-center gap-2">
        <span
          className={`font-mono text-[8px] tracking-wider ${theme.textDim}`}
          style={{ textShadow: `0 0 4px ${theme.glow}` }}
        >
          {clockStr}
        </span>
        <Battery
          className={`h-2.5 w-2.5 ${theme.textDim}`}
          style={{ filter: `drop-shadow(0 0 3px ${theme.glow})` }}
        />
        <Wifi
          className={`h-2.5 w-2.5 ${theme.textDim}`}
          style={{ filter: `drop-shadow(0 0 3px ${theme.glow})` }}
        />
        <Signal
          className={`h-2.5 w-2.5 ${theme.textDim}`}
          style={{ filter: `drop-shadow(0 0 3px ${theme.glow})` }}
        />
        <span
          className={`font-mono text-[7px] uppercase tracking-[0.2em] ${theme.textDim}`}
        >
          {config.subtitle}
        </span>
        {nightVision && (
          <span
            className="font-mono text-[7px] uppercase tracking-wider text-green-400/80"
            style={{ textShadow: "0 0 6px rgba(34,197,94,0.6)" }}
          >
            NV
          </span>
        )}
      </div>

      {/* ── TOP-LEFT (row 2): Language picker ── */}
      <div className="absolute left-[8%] top-[15%]">
        <LanguagePicker
          languages={languages}
          selected={language}
          onChange={onLanguageChange}
          theme={theme}
        />
      </div>

      {/* ── LEFT-CENTER: Context Panel ──
          The width cap lives here, not on the panel itself. These wrappers are
          absolutely positioned against the lens, so a percentage resolves
          against the lens width. On the panel it resolved against this wrapper,
          which is shrink-to-fit and therefore already collapsed — the panels
          were rendering ~60-80px wide at every viewport, one word per line. */}
      <div className="absolute left-[8%] top-[24%] w-[min(36%,220px)]">
        <ContextPanel entries={contextEntries} theme={theme} />
      </div>

      {/* ── TOP-RIGHT: Crushie Suggestion Box ──
          36% + 46% + the two 8% insets comes to 98%, so these two never collide
          however tall the suggestion grows. The px caps take over above roughly
          a 600px lens, where the percentages would leave a dead middle. */}
      <div className="absolute right-[8%] top-[10%] w-[min(46%,280px)]">
        <CrushieDisplay
          suggestion={suggestion}
          visualCue={visualCue}
          isPending={isPending}
          theme={theme}
          languageFlag={language.flag}
        />
      </div>

      {/* Screenshot flash */}
      {screenshotFlash && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/10" />
      )}

      {/* ── BOTTOM-LEFT: Voice Waveform + intake ── */}
      <div className="absolute bottom-[10%] left-[8%] flex max-w-[40%] flex-col gap-1">
        <div className="flex items-center gap-2">
          <AudioWaveform
            active={isListening}
            accentClass={`${theme.accent} bg-current`}
            glowColor={theme.glow}
          />
          <span
            className={`font-mono text-[7px] uppercase tracking-[0.15em] ${theme.textDim}`}
          >
            {isListening ? "INTAKE ACTIVE" : "INTAKE IDLE"}
          </span>
        </div>
        {voiceInput ? (
          <div
            className={`rounded ${theme.panelBg} ${theme.border} border px-2 py-1 backdrop-blur-sm`}
          >
            <span
              className={`font-mono text-[7px] uppercase tracking-[0.15em] ${theme.textDim}`}
            >
              YOU SAID
            </span>
            <p
              className={`mt-0.5 line-clamp-3 font-mono text-[10px] leading-tight ${theme.text}`}
              style={{ textShadow: `0 0 6px ${theme.glow}` }}
            >
              &quot;{voiceInput}&quot;
            </p>
          </div>
        ) : (
          isListening && (
            <span
              className={`font-mono text-[8px] italic ${theme.textDim}`}
              style={{ textShadow: `0 0 4px ${theme.glow}` }}
            >
              Listening…
            </span>
          )
        )}
      </div>

      {/* ── BOTTOM-RIGHT: Diagnostic Log + Vibe Badge ──
          max-w keeps this column inside its own half of the lens. Unbounded, a
          28-character vibe name plus "Synchronized" grew the badge wider than
          the whole lens at phone widths and sat straight on top of the
          bottom-left intake readout. */}
      <div className="absolute bottom-[10%] right-[8%] flex max-w-[52%] flex-col items-end gap-1">
        <DiagnosticLog
          entries={diagLog}
          textClass={theme.text}
          dimClass={theme.textDim}
        />
        <div
          className={`max-w-full rounded-full ${theme.border} border ${theme.panelBg} px-2 py-0.5 backdrop-blur-sm`}
        >
          <span
            className={`block truncate font-mono text-[7px] uppercase tracking-widest ${theme.accent}`}
            style={{ textShadow: `0 0 6px ${theme.glow}` }}
          >
            {/* The old 28-character JS slice appended its own "…" on top of
                the CSS ellipsis, so a long vibe read "…MINIM… …". Let truncate
                own it: full text on a wide lens, one ellipsis on a narrow one. */}
            {targetVibe} Synchronized
          </span>
        </div>
      </div>

      {/* ── Aviator: Targeting brackets ── */}
      {frameType === "aviator" && (
        <>
          {(
            [
              "left-[12%] top-[14%]",
              "right-[12%] top-[14%]",
              "bottom-[14%] left-[12%]",
              "bottom-[14%] right-[12%]",
            ] as const
          ).map((pos, i) => (
            <span
              key={pos}
              className={`absolute ${pos} font-mono text-[10px] text-amber-400/40`}
              style={{
                filter: "drop-shadow(0 0 4px rgba(251,191,36,0.3))",
              }}
            >
              {["┌", "┐", "└", "┘"][i]}
            </span>
          ))}
        </>
      )}

      {/* ── Sport: Energy bar ── */}
      {frameType === "sport" && (
        <div className="absolute bottom-[22%] left-[8%] flex items-center gap-1">
          <span className="font-mono text-[7px] uppercase tracking-wider text-fuchsia-400/60">
            NRG
          </span>
          <div className="flex gap-[1.5px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1 rounded-[1px]"
                style={{
                  backgroundColor:
                    i < Math.ceil(confidence * 10)
                      ? i < 4
                        ? "rgba(232,121,249,0.7)"
                        : i < 7
                          ? "rgba(232,121,249,0.5)"
                          : "rgba(232,121,249,0.3)"
                      : "rgba(232,121,249,0.1)",
                  filter:
                    i < Math.ceil(confidence * 10)
                      ? "drop-shadow(0 0 3px rgba(232,121,249,0.5))"
                      : "none",
                  transform: "skewX(-8deg)",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
