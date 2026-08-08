/* ─── Shared types for Glasses Simulator ──────────────────────────────────── */

export type GlassesFrameType = "wayfarer" | "aviator" | "sport" | "round";

export interface GlassesTheme {
  text: string;
  textDim: string;
  glow: string;
  border: string;
  panelBg: string;
  accent: string;
  scanline: string;
  overlayClass: string;
  hudClass: string;
}

export interface GlassesConfig {
  label: string;
  subtitle: string;
  clipPath: string;
  theme: GlassesTheme;
}

/**
 * The instruction sent as `language` to `realtime.getLiveSuggestion`.
 *
 * The server validates this as a length-bounded string, not an enum, so the
 * union below is a client-side allowlist rather than a mirror of a server
 * contract — it exists to stop a typo in the picker from silently changing what
 * the model is told. Adding a language means adding it here and in
 * `theme.ts`; no server change is required.
 */
export type LanguagePromptHint =
  | "Respond in English."
  | "Respond in Spanish."
  | "Respond in French."
  | "Respond in German."
  | "Respond in Portuguese."
  | "Respond in Italian."
  | "Respond in Japanese."
  | "Respond in Korean."
  | "Respond in Vietnamese."
  | "Respond in Mandarin Chinese."
  | "Respond in Thai."
  | "Respond in Hindi."
  | "Respond in Arabic.";

export interface LanguageOption {
  code: string;
  /** BCP-47 tag for SpeechRecognition.lang */
  speechCode: string;
  label: string;
  flag: string;
  /** Instruction snippet injected into the coach prompt */
  promptHint: LanguagePromptHint;
}

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionFactory = new () => SpeechRecognitionLike;

/** Context entry captured from environment / conversation / analysis */
export interface ContextEntry {
  id: string;
  timestamp: number;
  type: "environment" | "speech" | "visual_cue" | "analysis" | "emotion";
  label: string;
  value: string;
}

export interface MetaGlassesSimulatorProps {
  targetVibe: string;
  matchName?: string;
}

export const POLL_MS = 7000;
export const MIN_CONFIDENCE_TO_SPEAK = 0.8;
