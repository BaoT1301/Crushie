"use client";

import { useCallback, useRef } from "react";

/**
 * Hook that manages text-to-speech playback via the /api/realtime-tts endpoint.
 * Handles auto-cancellation of previous audio and mute state.
 */
export function useTts() {
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  /* The object URL is tracked alongside the element because clearing `src`
     stops `onended` from ever firing, so revoking there alone leaked every
     clip that was interrupted. */
  const activeUrlRef = useRef<string | null>(null);

  const releaseActive = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.onended = null;
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
  }, []);

  const playTts = useCallback(
    async (text: string, muted: boolean) => {
      if (muted) return;
      try {
        const response = await fetch("/api/realtime-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok || response.status === 204) return;
        const blob = await response.blob();
        if (!blob.size) return;

        releaseActive();

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeAudioRef.current = audio;
        activeUrlRef.current = url;
        audio.onended = () => {
          if (activeUrlRef.current === url) {
            URL.revokeObjectURL(url);
            activeUrlRef.current = null;
          }
        };
        await audio.play();
      } catch {
        // Gracefully ignore TTS errors
      }
    },
    [releaseActive],
  );

  const stopAudio = useCallback(() => {
    releaseActive();
  }, [releaseActive]);

  return { playTts, stopAudio };
}
