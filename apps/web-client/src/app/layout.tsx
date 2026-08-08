import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Gabarito, Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCReactProvider } from "@/trpc/client";
import { MotionProvider } from "@/components/motion-provider";
import { ThemeProvider } from "@/services/theme";
import { ThemeLoader } from "@/services/theme";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "@/styles/globals.css";

// Variable fonts, self-hosted at build time by next/font (no runtime request to
// Google, no layout shift).
//
// Gabarito carries display type. It is geometric with generous round bowls,
// which is the register warm consumer dating brands live in (Bumble's Circular,
// Hinge's Modern Era), and it echoes the rounded-square logo mark. It keeps
// enough character to avoid reading as a default, and it holds up at the ~96px
// the hero wordmark runs at.
const display = Gabarito({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crushie 💕",
  description:
    "An AI dating coach that reads a profile and writes openers that still sound like you.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Next's default viewport tag is `width=device-width, initial-scale=1`, which
// leaves viewport-fit at `auto`. Under `auto` the layout viewport stops at the
// safe area, so every `env(safe-area-inset-*)` in the app resolves to 0px and
// the bottom-anchored bars (the on-board step progress) have nothing to pad
// against. `cover` extends the viewport edge to edge and is what makes those
// insets report real values on notched iPhones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches the near-black --background so the iOS status bar and Android
  // toolbar do not frame the page in white.
  themeColor: "#0b0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        /* `dark` is set here rather than only by ThemeProvider on mount, so the
           first server-rendered paint is already the dark brand palette. Without
           it the page paints light and flips once hydration runs, which is the
           flash the old full-screen spinner was hiding. ThemeProvider still owns
           mode switching after mount. */
        className={`dark ${display.variable} ${body.variable}`}
      >
        <body className="font-body antialiased">
          <Suspense fallback={null}>
            <NuqsAdapter>
              <TRPCReactProvider>
                <ThemeProvider>
                  <MotionProvider>
                    <ThemeLoader>{children}</ThemeLoader>
                  </MotionProvider>
                </ThemeProvider>
              </TRPCReactProvider>
            </NuqsAdapter>
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
