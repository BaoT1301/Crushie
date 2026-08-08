"use client";

import { useEffect } from "react";
import { PageError } from "@/components/error-display";

export default function DashboardError({
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
    <PageError
      title="This page hit a bump 💔"
      message={
        error.message ||
        "Something unexpected happened while loading this page. Try again."
      }
      onRetry={retry}
    />
  );
}
