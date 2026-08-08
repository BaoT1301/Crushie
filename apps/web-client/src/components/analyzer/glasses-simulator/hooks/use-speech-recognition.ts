"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SpeechRecognitionLike,
  SpeechRecognitionFactory,
  LanguageOption,
} from "../types";

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  voiceInput: string;
  speechSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  setAutoVoice: (enabled: boolean) => void;
  autoVoiceEnabled: boolean;
  /** Sync language – restarts recognition with new BCP-47 tag */
  setLanguage: (lang: LanguageOption) => void;
  /** Callback for external consumers: current topic derived from voice */
  currentTopic: string;
}

/** Delay before auto-restarting recognition after it ends (ms) */
const RESTART_DELAY_MS = 600;
const FATAL_ERRORS = new Set(["service-not-allowed", "audio-capture"]);

export function useSpeechRecognition(
  initialLanguage: LanguageOption,
): UseSpeechRecognitionReturn {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const autoVoiceEnabledRef = useRef(true);
  const languageRef = useRef(initialLanguage);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guard against double-starts */
  const startingRef = useRef(false);
  /** True when the user explicitly called stopListening */
  const manualStopRef = useRef(false);
  /** Ref mirror for isListening – avoids stale closures */
  const isListeningRef = useRef(false);
  /** Stable ref to latest startListening – used by scheduleRestart */
  const startListeningRef = useRef<() => void>(() => {});

  const [isListening, setIsListening] = useState(false);
  const [voiceInput, setVoiceInput] = useState("");
  const [currentTopic, setCurrentTopic] = useState("");
  const [autoVoiceEnabled, setAutoVoiceEnabledState] = useState(true);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionFactory;
      webkitSpeechRecognition?: SpeechRecognitionFactory;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  /** Cancel any pending restart timer */
  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!autoVoiceEnabledRef.current || manualStopRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      recognitionRef.current = null;
      startListeningRef.current();
    }, RESTART_DELAY_MS);
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    if (!speechSupported || typeof window === "undefined") return;
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionFactory;
      webkitSpeechRecognition?: SpeechRecognitionFactory;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    // If already listening with an active instance, do nothing.
    if (recognitionRef.current && isListeningRef.current) return;
    clearRestartTimer();

    // If a stale instance exists, stop it before recreating.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    startingRef.current = true;
    manualStopRef.current = false;

    const r = new Ctor();
    r.lang = languageRef.current.speechCode;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = true; // keep listening — avoids constant stop/start flicker

    r.onstart = () => {
      startingRef.current = false;
      isListeningRef.current = true;
      setIsListening(true);
    };

    r.onresult = (e) => {
      const t = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setVoiceInput(t);
      if (t) setCurrentTopic(t);
    };

    r.onerror = (event) => {
      startingRef.current = false;
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;
      const code = event?.error;

      // Do not loop-restart on fatal permission/device errors.
      if (code && FATAL_ERRORS.has(code)) {
        autoVoiceEnabledRef.current = false;
        setAutoVoiceEnabledState(false);
        clearRestartTimer();
        return;
      }

      // Auto-restart after transient errors (e.g. "no-speech", "network").
      scheduleRestart();
    };

    r.onend = () => {
      startingRef.current = false;
      isListeningRef.current = false;
      setIsListening(false);
      if (autoVoiceEnabledRef.current) {
        window.setTimeout(() => {
          recognitionRef.current = null;
          // Via the ref, not a direct self-reference. Naming `startListening`
          // inside its own useCallback body reads the binding before it is
          // initialised — it happens to work because the timeout fires later,
          // but it relies on timing rather than on the value existing. The ref
          // is already kept in sync below and is what scheduleRestart uses.
          startListeningRef.current();
        }, 250);
      }
    };
    recognitionRef.current = r;

    try {
      r.start();
    } catch {
      // Already started or blocked (often until user interaction)
      startingRef.current = false;
      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [speechSupported, clearRestartTimer, scheduleRestart]);

  // Keep the ref in sync so scheduleRestart and the onend handler always call
  // the latest version.
  //
  // Assigned in an effect rather than during render: writing `.current` while
  // rendering is a side effect, and React may render without committing, which
  // would leave the ref pointing at a callback from a discarded pass. Both
  // readers fire from timers well after commit, so effect timing is soon
  // enough.
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const setAutoVoice = useCallback(
    (enabled: boolean) => {
      autoVoiceEnabledRef.current = enabled;
      setAutoVoiceEnabledState(enabled);
      if (!enabled) {
        recognitionRef.current?.stop();
        setIsListening(false);
      } else if (speechSupported && !isListening) {
        startListening();
      }
    },
    [speechSupported, isListening, startListening],
  );

  const setLanguage = useCallback((lang: LanguageOption) => {
    languageRef.current = lang;
    // Restart recognition with new language
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  /* Auto-start when autoVoice flips on */
  useEffect(() => {
    autoVoiceEnabledRef.current = autoVoiceEnabled;
    if (!autoVoiceEnabled) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    // Only start if there's no active recognition (avoid fighting onend restart)
    if (
      speechSupported &&
      !recognitionRef.current &&
      !restartTimerRef.current
    ) {
      startListening();
    }
  }, [autoVoiceEnabled, speechSupported, startListening, stopListening]);

  /* Retry start on next user interaction (required by some browsers) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!speechSupported || !autoVoiceEnabled || isListening) return;
    if (recognitionRef.current || restartTimerRef.current) return;

    const handleUserGesture = () => {
      if (
        !recognitionRef.current &&
        !isListeningRef.current &&
        autoVoiceEnabledRef.current
      ) {
        startListening();
      }
    };

    window.addEventListener("pointerdown", handleUserGesture, { once: true });
    window.addEventListener("keydown", handleUserGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [speechSupported, autoVoiceEnabled, isListening, startListening]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return {
    isListening,
    voiceInput,
    speechSupported,
    startListening,
    stopListening,
    setAutoVoice,
    autoVoiceEnabled,
    setLanguage,
    currentTopic,
  };
}
