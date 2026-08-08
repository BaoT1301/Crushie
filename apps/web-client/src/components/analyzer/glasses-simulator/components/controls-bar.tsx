"use client";

import { Moon, Sun, Camera, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GlassesFrameType, GlassesConfig, GlassesTheme } from "../types";
import { AudioWaveform } from "./audio-waveform";

interface ControlsBarProps {
  frameType: GlassesFrameType;
  glassesConfigs: Record<GlassesFrameType, GlassesConfig>;
  onFrameChange: (type: GlassesFrameType) => void;
  nightVision: boolean;
  onToggleNightVision: () => void;
  onScreenshot: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  autoVoiceEnabled: boolean;
  onToggleAutoVoice: () => void;
  speechSupported: boolean;
  isListening: boolean;
  theme: GlassesTheme;
  confidencePct: number;
}

export function ControlsBar({
  frameType,
  glassesConfigs,
  onFrameChange,
  nightVision,
  onToggleNightVision,
  onScreenshot,
  isMuted,
  onToggleMute,
  autoVoiceEnabled,
  onToggleAutoVoice,
  speechSupported,
  isListening,
  theme,
  confidencePct,
}: ControlsBarProps) {
  return (
    /* The three icon-only controls grow to 44px on a coarse pointer: they
       sit outside the lens, so unlike the HUD they are ordinary UI and need a
       real touch target. */
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 px-4">
      {/* Frame picker */}
      {(Object.keys(glassesConfigs) as GlassesFrameType[]).map((type) => {
        const c = glassesConfigs[type];
        const active = frameType === type;
        return (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={
              active
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-rose-300/40 bg-black/30 text-rose-300 hover:bg-rose-500/10"
            }
            onClick={() => onFrameChange(type)}
          >
            {c.label}
            <span className="ml-1 text-[9px] opacity-60">{c.subtitle}</span>
          </Button>
        );
      })}

      {/* Divider */}
      <span className="mx-1 h-5 w-px bg-rose-400/20" />

      {/* Night vision */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 hover:bg-rose-500/15 ${
          nightVision ? "text-green-400" : "text-rose-300 hover:text-rose-200"
        }`}
        onClick={onToggleNightVision}
        aria-label={
          nightVision ? "Disable night vision" : "Enable night vision"
        }
      >
        {nightVision ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </Button>

      {/* Screenshot */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
        onClick={onScreenshot}
        aria-label="Capture screenshot"
      >
        <Camera className="h-4 w-4" />
      </Button>

      {/* Mute */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
        onClick={onToggleMute}
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>

      {/* Auto-voice toggle */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-rose-300/40 bg-black/30 text-[10px] text-rose-300 hover:bg-rose-500/10"
        onClick={onToggleAutoVoice}
        disabled={!speechSupported}
      >
        <AudioWaveform
          active={isListening}
          accentClass={`${theme.accent} bg-current`}
          glowColor={theme.glow}
        />
        <span className="ml-1">
          {!speechSupported
            ? "Voice N/A"
            : autoVoiceEnabled
              ? "Auto Voice"
              : "Voice Off"}
        </span>
      </Button>

      {/* Confidence readout */}
      <span className="font-mono text-[10px] text-rose-400/80">
        {confidencePct}%
      </span>
    </div>
  );
}
