"use client";

import { createContext, useContext, useEffect, Suspense } from "react";
import { useEditorStore } from "./store";
import { applyThemeToElement } from "./apply";
import { useThemePresetFromUrl } from "./hooks";
import { ThemeMode } from "./types";

/**
 * Reads the `?theme=` preset. Renders nothing.
 *
 * It is a separate component, mounted inside its own Suspense boundary, purely
 * to contain a prerender bailout.
 *
 * useThemePresetFromUrl uses nuqs, which calls next/navigation's
 * useSearchParams. In a statically prerendered route that forces the nearest
 * Suspense boundary to bail to client-side rendering. This hook used to be
 * called directly in ThemeProvider's body, and the only boundary above it was
 * the one wrapping the whole app in app/layout.tsx — so the entire tree
 * bailed. The landing page shipped as an empty shell with
 * BAILOUT_TO_CLIENT_SIDE_RENDERING and no server-rendered copy at all, which on
 * the one page that needs to be crawlable is the worst place for it.
 *
 * The bailout cannot be removed while the feature exists — reading a query
 * parameter genuinely requires the request. Isolating it means only this empty
 * leaf renders on the client, and everything around it prerenders normally.
 */
function ThemePresetFromUrl() {
  useThemePresetFromUrl();
  return null;
}

type Coords = { x: number; y: number };

type ThemeProviderState = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: (coords?: Coords) => void;
};

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
  toggleTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
};

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const { themeState, setThemeState } = useEditorStore();

  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;

    applyThemeToElement(themeState, root);
  }, [themeState]);

  const handleThemeChange = (newMode: ThemeMode) => {
    setThemeState({ ...themeState, currentMode: newMode });
  };

  const handleThemeToggle = (coords?: Coords) => {
    const root = document.documentElement;
    const newMode = themeState.currentMode === "light" ? "dark" : "light";

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!document.startViewTransition || prefersReducedMotion) {
      handleThemeChange(newMode);
      return;
    }

    if (coords) {
      root.style.setProperty("--x", `${coords.x}px`);
      root.style.setProperty("--y", `${coords.y}px`);
    }

    document.startViewTransition(() => {
      handleThemeChange(newMode);
    });
  };

  const value: ThemeProviderState = {
    theme: themeState.currentMode,
    setTheme: handleThemeChange,
    toggleTheme: handleThemeToggle,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {/* Its own boundary, so the bailout stops here instead of taking the
          whole app with it. See ThemePresetFromUrl above. */}
      <Suspense fallback={null}>
        <ThemePresetFromUrl />
      </Suspense>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
