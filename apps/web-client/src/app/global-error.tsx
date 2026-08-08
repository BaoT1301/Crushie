"use client";

import { useEffect } from "react";
import { PageError } from "@/components/error-display";
// global-error replaces the root layout when it renders, so it has to bring its
// own document and its own stylesheet — none of app/layout.tsx runs. The
// next/font variables are not available here either; --font-body falls back to
// the system stack, which is why no font loader is imported (font loaders
// cannot be called from a Client Component, and this file must be one).
import "@/styles/globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="font-body antialiased bg-background text-foreground">
        <title>Something went wrong — Crushie</title>
        <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center justify-center px-4">
          <PageError
            title="Crushie broke a little 💔"
            message={
              error.message ||
              "Something unexpected happened. Let's try that again."
            }
            onRetry={retry}
            showBackButton={false}
          />
        </main>
      </body>
    </html>
  );
}
