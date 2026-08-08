import { ThemeEditorState } from "../types";

// ============================================================================
// Common Styles (shared between light and dark modes)
// ============================================================================

export const COMMON_STYLES = [
  "font-sans",
  "font-serif",
  "font-mono",
  "radius",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
  "letter-spacing",
  "spacing",
];

// ============================================================================
// Default Fonts
// ============================================================================

export const DEFAULT_FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

export const DEFAULT_FONT_SERIF =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

export const DEFAULT_FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// ============================================================================
// Default Light Theme Styles
// ============================================================================

export const defaultLightThemeStyles = {
  background: "#fff5f7",
  foreground: "#4a1028",
  card: "#ffffff",
  "card-foreground": "#4a1028",
  popover: "#ffffff",
  "popover-foreground": "#4a1028",
  primary: "#e63972",
  "primary-foreground": "#ffffff",
  secondary: "#fce4ec",
  "secondary-foreground": "#880e4f",
  muted: "#fdf2f4",
  "muted-foreground": "#a0616c",
  accent: "#fce4ec",
  "accent-foreground": "#880e4f",
  destructive: "#c62828",
  "destructive-foreground": "#ffffff",
  border: "#f8bbd0",
  input: "#f8bbd0",
  ring: "#e63972",
  "chart-1": "#e63972",
  "chart-2": "#f06292",
  "chart-3": "#ec407a",
  "chart-4": "#ad1457",
  "chart-5": "#880e4f",
  radius: "0.75rem",
  sidebar: "#fdf2f4",
  "sidebar-foreground": "#4a1028",
  "sidebar-primary": "#e63972",
  "sidebar-primary-foreground": "#ffffff",
  "sidebar-accent": "#fce4ec",
  "sidebar-accent-foreground": "#880e4f",
  "sidebar-border": "#f8bbd0",
  "sidebar-ring": "#e63972",
  "font-sans": DEFAULT_FONT_SANS,
  "font-serif": DEFAULT_FONT_SERIF,
  "font-mono": DEFAULT_FONT_MONO,

  "shadow-color": "oklch(0 0 0)",
  "shadow-opacity": "0.1",
  "shadow-blur": "3px",
  "shadow-spread": "0px",
  "shadow-offset-x": "0",
  "shadow-offset-y": "1px",

  "letter-spacing": "0em",
  spacing: "0.25rem",
};

// ============================================================================
// Default Dark Theme Styles
// ============================================================================

export const defaultDarkThemeStyles = {
  ...defaultLightThemeStyles,
  background: "#0b0a0b",
  foreground: "#fce4ec",
  card: "#141215",
  "card-foreground": "#fce4ec",
  popover: "#141215",
  "popover-foreground": "#fce4ec",
  primary: "#f472b6",
  "primary-foreground": "#0b0a0b",
  secondary: "#231a1f",
  "secondary-foreground": "#fce4ec",
  muted: "#191719",
  "muted-foreground": "#b9b2b5",
  accent: "#2a1f25",
  "accent-foreground": "#fce4ec",
  destructive: "#fb7185",
  "destructive-foreground": "#0b0a0b",
  border: "#2c262a",
  input: "#2c262a",
  ring: "#f472b6",
  "chart-1": "#f472b6",
  "chart-2": "#f9a8d4",
  "chart-3": "#ec4899",
  "chart-4": "#db2777",
  "chart-5": "#fbcfe8",
  radius: "0.75rem",
  sidebar: "#100e11",
  "sidebar-foreground": "#fce4ec",
  "sidebar-primary": "#f472b6",
  "sidebar-primary-foreground": "#0b0a0b",
  "sidebar-accent": "#191719",
  "sidebar-accent-foreground": "#fce4ec",
  "sidebar-border": "#2c262a",
  "sidebar-ring": "#f472b6",

  "shadow-color": "oklch(0 0 0)",

  "letter-spacing": "0em",
  spacing: "0.25rem",
};

// ============================================================================
// Default Theme State
// ============================================================================

export const defaultThemeState: ThemeEditorState = {
  styles: {
    light: defaultLightThemeStyles,
    dark: defaultDarkThemeStyles,
  },
  // Deterministic rather than a prefers-color-scheme lookup. This object is
  // evaluated at module load, so on the server `window` is undefined and the
  // mode would bake in as "light", then disagree with the client. Crushie is a
  // dark brand and production ships dark, so it is pinned. The theme editor
  // still switches modes at runtime.
  currentMode: "dark",
  hslAdjustments: {
    hueShift: 0,
    saturationScale: 1,
    lightnessScale: 1,
  },
};
