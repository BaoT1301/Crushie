"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactWebcam, { type WebcamProps } from "react-webcam";
import { useMutation } from "@tanstack/react-query";

// react-webcam ships class-component types incompatible with React 19's JSX types.
// Cast to a function component so it can be rendered as JSX.
const Webcam = ReactWebcam as unknown as React.FC<
  Partial<WebcamProps> & { ref?: React.Ref<ReactWebcam> }
>;
import { useTRPC } from "@/trpc/client";

import type {
  GlassesFrameType,
  LanguageOption,
  ContextEntry,
  MetaGlassesSimulatorProps,
} from "./types";
import { POLL_MS, MIN_CONFIDENCE_TO_SPEAK } from "./types";
import { GLASSES_CONFIG, LANGUAGES, useGlassesTheme } from "./theme";
import { HUD_STYLES } from "./hud-styles";
import { HudOverlay } from "./components/hud-overlay";
import { ControlsBar } from "./components/controls-bar";
import { useSpeechRecognition } from "./hooks/use-speech-recognition";
import { useTts } from "./hooks/use-tts";

/* ─── Main orchestrator ───────────────────────────────────────────────────── */

export function MetaGlassesSimulator({
  targetVibe,
  matchName = "your match",
}: MetaGlassesSimulatorProps) {
  const trpc = useTRPC();
  const webcamRef = useRef<ReactWebcam | null>(null);
  const pollingTimeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const lastSpokenSuggestionRef = useRef("");
  const lastSpeechContextRef = useRef("");
  const voiceInputRef = useRef("");

  /* ── State ── */
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [frameType, setFrameType] = useState<GlassesFrameType>("wayfarer");
  const [suggestion, setSuggestion] = useState("Reading the room...");
  const [visualCue, setVisualCue] = useState("Scanning environment");
  const [confidence, setConfidence] = useState(0);
  const [diagnosticLog, setDiagnosticLog] = useState<string[]>([
    "[SYS] CRUSHIE OS v2.6.0 BOOT",
    "[SCAN] ENVIRONMENT MAPPING...",
  ]);
  const [language, setLanguage] = useState<LanguageOption>(LANGUAGES[0]!);
  const [nightVision, setNightVision] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [contextEntries, setContextEntries] = useState<ContextEntry[]>([]);

  const languageRef = useRef(language);

  /* ── Hooks ── */
  const config = useGlassesTheme(frameType);
  const { theme } = config;

  const speech = useSpeechRecognition(LANGUAGES[0]!);
  const { playTts, stopAudio } = useTts();

  const liveSuggestionMutation = useMutation(
    trpc.realtime.getLiveSuggestion.mutationOptions(),
  );

  /* The mutation object is a new identity on every state transition (pending →
     success → …). Depending on it directly made `pollSuggestion` — and the
     polling effect below — rebuild after every request, so the effect's cleanup
     ran mid-cycle: POLL_MS was never waited out and stopAudio() cut the TTS off
     mid-sentence. Read it through a ref so both stay stable. */
  const liveSuggestionMutationRef = useRef(liveSuggestionMutation);
  liveSuggestionMutationRef.current = liveSuggestionMutation;

  /* Same reason: `speech` is a fresh object each render. */
  const currentTopicRef = useRef(speech.currentTopic);
  currentTopicRef.current = speech.currentTopic;

  /* ── Stop TTS immediately when muting ── */
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) stopAudio();
  }, [isMuted, stopAudio]);

  /* ── Context entry helper ── */
  const pushContext = useCallback(
    (type: ContextEntry["type"], label: string, value: string) => {
      setContextEntries((prev) => [
        ...prev.slice(-20),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          type,
          label,
          value,
        },
      ]);
    },
    [],
  );

  /* ── Language change handler ── */
  const handleLanguageChange = useCallback(
    (lang: LanguageOption) => {
      setLanguage(lang);
      languageRef.current = lang;
      speech.setLanguage(lang);
    },
    [speech],
  );

  /* ── Screenshot ── */
  const captureScreenshot = useCallback(() => {
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 3000);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `crushie-capture-${Date.now()}.jpg`;
    a.click();
  }, []);

  /* ── Diagnostic log helper ── */
  const pushDiag = useCallback((msg: string) => {
    setDiagnosticLog((prev) => [...prev.slice(-12), msg]);
  }, []);

  /* ── Push speech context immediately when transcript updates ── */
  useEffect(() => {
    const transcript = speech.voiceInput.trim();
    voiceInputRef.current = transcript;
    if (!transcript) return;
    if (transcript === lastSpeechContextRef.current) return;

    lastSpeechContextRef.current = transcript;
    pushContext("speech", matchName, transcript.slice(0, 100));
  }, [speech.voiceInput, pushContext, matchName]);

  /* ── Polling ── */
  const pollSuggestion = useCallback(async () => {
    if (inFlightRef.current) return;
    const frameDataUrl = webcamRef.current?.getScreenshot();
    if (!frameDataUrl) return;
    const base64 = frameDataUrl.split(",")[1];
    if (!base64) return;
    inFlightRef.current = true;
    pushDiag(
      `[SCAN] ANALYSING FRAME (${languageRef.current.code.toUpperCase()})...`,
    );
    pushContext("environment", "Frame scan", "Analysing visual feed...");
    try {
      const res = await liveSuggestionMutationRef.current.mutateAsync({
        frame: base64,
        targetVibe,
        currentTopic: voiceInputRef.current || currentTopicRef.current,
        language: languageRef.current.promptHint,
      });
      const next = res.suggestion.trim();
      setSuggestion(next);
      setVisualCue(res.visual_cue_detected);
      setConfidence(res.confidence);

      pushDiag(`[MATCH] VIBE: ${targetVibe.toUpperCase().slice(0, 18)}`);
      pushDiag(
        `[CONF] ${Math.round(res.confidence * 100)}% — ${res.visual_cue_detected.toUpperCase().slice(0, 24)}`,
      );

      /* ── Feed context entries from result ── */
      if (res.visual_cue_detected) {
        pushContext("visual_cue", "Visual cue", res.visual_cue_detected);
      }
      if (next) {
        pushContext("analysis", "Crushie says", next.slice(0, 120));
      }
      pushContext(
        "emotion",
        "Vibe sync",
        `${Math.round(res.confidence * 100)}% — ${targetVibe.slice(0, 24)}`,
      );

      /* ── TTS ── */
      if (
        res.confidence >= MIN_CONFIDENCE_TO_SPEAK &&
        next.length > 0 &&
        next !== lastSpokenSuggestionRef.current
      ) {
        lastSpokenSuggestionRef.current = next;
        pushDiag("[TTS] PROJECTING VOICE...");
        await playTts(next, isMutedRef.current);
      }
    } catch {
      pushDiag("[ERR] LINK UNSTABLE, RETRYING...");
      setVisualCue("Connection unstable, retrying...");
    } finally {
      inFlightRef.current = false;
    }
  }, [playTts, pushDiag, pushContext, targetVibe]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await pollSuggestion();
      if (!cancelled)
        pollingTimeoutRef.current = window.setTimeout(run, POLL_MS);
    };
    run();
    return () => {
      cancelled = true;
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
      stopAudio();
    };
  }, [pollSuggestion, stopAudio]);

  /* ── Derived ── */
  const confidencePct = Math.round(confidence * 100);
  const now = new Date();
  const clockStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  return (
    <>
      {/* Inject keyframes once */}
      <style dangerouslySetInnerHTML={{ __html: HUD_STYLES }} />

      <div className="space-y-5">
        {/* ── Glasses viewport ── */}
        <div
          className="relative mx-auto w-full max-w-5xl rounded-3xl bg-black/80 shadow-[0_0_80px_rgba(0,0,0,0.6)]"
          style={{
            clipPath: config.clipPath,
            transform: "translateZ(0)",
            willChange: "transform",
          }}
        >
          <div className="relative aspect-5/4 w-full sm:aspect-video">
            {/* Camera feed */}
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              screenshotQuality={0.55}
              videoConstraints={{
                width: 640,
                height: 360,
                facingMode: "user",
              }}
              className="h-full w-full object-cover"
            />

            {/* Theme overlay tint */}
            <div
              className={`pointer-events-none absolute inset-0 ${theme.overlayClass}`}
            />

            {/* Night vision overlay */}
            {nightVision && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,40,0,0.45) 0%, rgba(0,60,0,0.35) 50%, rgba(0,40,0,0.45) 100%)",
                  mixBlendMode: "multiply",
                }}
              />
            )}

            {/* Digital noise grain */}
            <div
              className="pointer-events-none absolute inset-0 mix-blend-screen opacity-[0.035]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
                backgroundSize: "128px 128px",
                animation: "hud-grain 0.4s steps(3) infinite",
                willChange: "transform",
              }}
            />

            {/* Chromatic aberration */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.012]"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,0,0,0.15) 0%, transparent 33%, transparent 66%, rgba(0,0,255,0.15) 100%)",
                mixBlendMode: "screen",
              }}
            />

            {/* Scanline */}
            <div
              className={`pointer-events-none absolute left-0 right-0 h-px ${theme.scanline} blur-[0.5px]`}
              style={{
                boxShadow: `0 0 12px ${theme.glow}`,
                animation: "hud-scanline 4s linear infinite",
                willChange: "transform",
              }}
            />

            {/* ── HUD Overlay (all in-lens elements) ── */}
            <HudOverlay
              config={config}
              theme={theme}
              frameType={frameType}
              clockStr={clockStr}
              nightVision={nightVision}
              language={language}
              languages={LANGUAGES}
              onLanguageChange={handleLanguageChange}
              suggestion={suggestion}
              visualCue={visualCue}
              isPending={liveSuggestionMutation.isPending}
              isListening={speech.isListening}
              voiceInput={speech.voiceInput}
              diagnosticLog={diagnosticLog}
              contextEntries={contextEntries}
              confidence={confidence}
              targetVibe={targetVibe}
              screenshotFlash={screenshotFlash}
            />
          </div>
        </div>

        {/* ── Controls (outside lens) ── */}
        <ControlsBar
          frameType={frameType}
          glassesConfigs={GLASSES_CONFIG}
          onFrameChange={setFrameType}
          nightVision={nightVision}
          onToggleNightVision={() => setNightVision((p) => !p)}
          onScreenshot={captureScreenshot}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted((p) => !p)}
          autoVoiceEnabled={speech.autoVoiceEnabled}
          onToggleAutoVoice={() =>
            speech.setAutoVoice(!speech.autoVoiceEnabled)
          }
          speechSupported={speech.speechSupported}
          isListening={speech.isListening}
          theme={theme}
          confidencePct={confidencePct}
        />
      </div>
    </>
  );
}
