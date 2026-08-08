"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, MapPin, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AnalyzerResults,
  WeatherBanner,
  PlacePostcard,
} from "@/components/analyzer";
import type {
  AnalyzerResult,
  WeatherContext,
  NearbyPlace,
} from "@/types/analyzer";
import { AmbientBackground } from "@/components/ambient-background";

export default function AnalyzerSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();

  const sessionQuery = useQuery(
    trpc.llm.getAnalyzerSession.queryOptions({ id }),
  );

  // ── Loading ─────────────────────────────────────────────────────────

  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading analysis...</span>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            {sessionQuery.error?.message ?? "Session not found"}
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

  // ── Build result shape ──────────────────────────────────────────────

  const session = sessionQuery.data;
  const result: AnalyzerResult = {
    id: session.id,
    userId: session.userId,
    imageHash: session.imageHash,
    hintTags: (session.hintTags as string[]) ?? [],
    predictedStyle: session.predictedStyle as AnalyzerResult["predictedStyle"],
    vibePrediction: session.vibePrediction as AnalyzerResult["vibePrediction"],
    conversationOpeners: (session.conversationOpeners as string[]) ?? [],
    dateSuggestions:
      (session.dateSuggestions as AnalyzerResult["dateSuggestions"]) ?? [],
    modelVersion: session.modelVersion ?? "",
    latencyMs: session.latencyMs ?? 0,
    createdAt: session.createdAt,
    city: session.city ?? undefined,
    weatherContext: session.weatherContext as WeatherContext | undefined,
    nearbyPlaces: session.nearbyPlaces as NearbyPlace[] | undefined,
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background relative overflow-hidden">
      {/* Background */}
      <AmbientBackground />

      <div className="relative z-10 container max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Back nav + metadata */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link href="/analyze-profile">
            <Button variant="ghost" size="sm" className="gap-1.5 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to Analyzer
            </Button>
          </Link>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {format(new Date(session.createdAt), "PPP 'at' p")} (
              {formatDistanceToNow(new Date(session.createdAt), {
                addSuffix: true,
              })}
              )
            </span>
            {result.city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {result.city}
              </span>
            )}

            <Link href={`/analyze-profile/${id}/simulator`}>
              <Button
                variant="outline"
                size="sm"
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                Launch Simulator Mode
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Environment context if available */}
        {result.weatherContext && result.city && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-3xl mx-auto mb-6 space-y-4"
          >
            <WeatherBanner weather={result.weatherContext} city={result.city} />
            {result.nearbyPlaces && result.nearbyPlaces.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Nearby date spots
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {result.nearbyPlaces.map((place, i) => (
                    <PlacePostcard
                      key={place.placeId}
                      place={place}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Analyzer results (read-only, no reset) */}
        <AnalyzerResults result={result} />
      </div>
    </div>
  );
}
