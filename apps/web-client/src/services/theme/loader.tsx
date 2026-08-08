"use client";

/**
 * Theme loader.
 *
 * This previously returned a full-screen spinner until a `mounted` effect
 * fired, which meant the server sent a spinner and nothing else for every
 * route in the app. Search crawlers and the first paint both saw a loading
 * state instead of content, so LCP was gated behind hydration and the landing
 * page had no server-rendered copy at all.
 *
 * The FOUC it was guarding against does not actually apply here. Base theme
 * tokens live in `:root` and `.dark` in globals.css, so every element is fully
 * styled on the very first paint. The only thing ThemeProvider changes after
 * mount is the CSS variable values for a custom preset, and only for users who
 * saved one in the theme editor. Those variables are written straight to
 * document.documentElement outside React reconciliation, so swapping them
 * cannot cause a hydration mismatch.
 *
 * Trade made deliberately: a user with a saved custom preset may see the
 * default brand palette for roughly one frame before their preset applies.
 * That is a much better deal than blocking the entire app behind client-side
 * JavaScript.
 */
export function ThemeLoader({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
