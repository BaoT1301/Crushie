"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { MetaGlassesSimulator } from "@/components/analyzer";

export default function AnalyzeProfileSimulatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();

  const sessionQuery = useQuery(
    trpc.llm.getAnalyzerSession.queryOptions({ id }),
  );

  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Preparing simulator...</span>
        </div>
      </div>
    );
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            {sessionQuery.error?.message ?? "Analysis session not found"}
          </p>
          <Link href="/analyze-profile">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Back to Analyzer
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const targetVibe = sessionQuery.data.predictedStyle ?? "Aesthetic Minimalist";

  return (
    <div className="min-h-dvh bg-background px-4 py-8 md:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/analyze-profile/${id}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Back to Analysis
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-primary drop-shadow-[0_0_12px_var(--primary)]">
            Live Date Coach Simulator
          </h1>
        </div>

        <MetaGlassesSimulator targetVibe={targetVibe} />
      </div>
    </div>
  );
}
