"use client";

import { useState, useCallback } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Zap, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AnalyzerResults,
  AnalyzerUploadZone,
  WeatherBanner,
  PlacePostcard,
  AnalyzerHistoryGrid,
  SidePrism,
  type ImagePreview,
} from "@/components/analyzer";
import type {
  AnalyzerResult,
  LocationInput,
  AnalyzerSessionSummary,
} from "@/types/analyzer";
import { AmbientBackground } from "@/components/ambient-background";

// ============================================================================
// Page
// ============================================================================

export default function AnalyzeProfilePage() {
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [hintTags, setHintTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [location, setLocation] = useState<LocationInput | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | undefined>();

  const trpc = useTRPC();

  // Upload images → get URLs, then analyze
  const uploadMutation = useMutation(
    trpc.uploads.uploadAnalyzerImage.mutationOptions(),
  );
  const analyzeMutation = useMutation(
    trpc.llm.analyzeProfile.mutationOptions(),
  );

  // History query
  const historyQuery = useQuery(
    trpc.llm.getAnalyzerHistory.queryOptions({
      cursor: historyCursor,
      limit: 12,
    }),
  );

  const isPending = isUploading || analyzeMutation.isPending;

  // ── Hash images ─────────────────────────────────────────────────────

  const hashImages = async (files: File[]): Promise<string> => {
    const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
    const totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // ── Analyze flow ────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (images.length === 0) return;

    try {
      setIsUploading(true);

      // 1. Hash all images
      const imageHash = await hashImages(images.map((img) => img.file));

      // 2. Upload all images to Supabase Storage (parallel)
      const uploadResults = await Promise.all(
        images.map(async (img) => {
          const buffer = await img.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              "",
            ),
          );

          return uploadMutation.mutateAsync({
            base64,
            fileName: img.file.name,
            mimeType: img.file.type as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/heic",
          });
        }),
      );

      setIsUploading(false);

      const imageUrls = uploadResults.map((r) => r.url);

      // 3. Analyze via LLM (with optional location)
      analyzeMutation.mutate(
        {
          imageUrls,
          imageHash,
          hintTags: hintTags.length > 0 ? hintTags : [],
          location: location ?? undefined,
        },
        {
          onSuccess: () => {
            // Refetch history after a new analysis
            historyQuery.refetch();
          },
        },
      );
    } catch {
      setIsUploading(false);
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────

  const handleReset = () => {
    analyzeMutation.reset();
    setImages([]);
    setHintTags([]);
    setIsUploading(false);
  };

  // ── Load more history ───────────────────────────────────────────────

  // nextCursor is read into a local first so the dependency the React Compiler
  // infers (`historyQuery.data`) matches the one declared. When they disagree
  // the compiler cannot prove the manual memo is safe and silently skips
  // optimizing this entire component — the memo itself was correct, just
  // narrower than what it could see.
  const nextHistoryCursor = historyQuery.data?.nextCursor;

  const handleLoadMore = useCallback(() => {
    if (nextHistoryCursor) {
      setHistoryCursor(nextHistoryCursor);
    }
  }, [nextHistoryCursor]);

  const result = analyzeMutation.data?.session as AnalyzerResult | undefined;

  /**
   * Whether the main results column has anything of its own to show.
   *
   * Weather, nearby places and the mission map all depend on
   * OPENWEATHER_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. With none of them
   * configured the column renders nothing but the reset button while SidePrism
   * holds the entire analysis, which looks like a broken page rather than a
   * degraded feature.
   */
  const hasEnvContent = Boolean(
    result &&
      ((result.weatherContext && result.city) ||
        (result.nearbyPlaces && result.nearbyPlaces.length > 0) ||
        (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY &&
          result.dateSuggestions.length > 0)),
  );

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background relative overflow-hidden">
      <AmbientBackground />

      {/* Content */}
      <div className="relative z-10 container max-w-6xl mx-auto px-4 py-6 md:py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
                          <Sparkles className="w-7 h-7 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
              Crush Analyzer
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
            Upload screenshots of someone&apos;s profile to get AI-powered
            tactical conversation advice
          </p>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="analyze" className="w-full">
          <div className="flex justify-center mb-6">
            <TabsList>
              <TabsTrigger value="analyze">New Vibe Check</TabsTrigger>
              <TabsTrigger value="history">Analysis History</TabsTrigger>
            </TabsList>
          </div>

          {/* ── Tab 1: New Vibe Check ──────────────────────────────── */}
          <TabsContent value="analyze">
            <AnimatePresence mode="wait">
              {!result ? (
                /* ── Upload Mode ──────────────────────────────────── */
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="max-w-3xl mx-auto space-y-5"
                >
                  <AnalyzerUploadZone
                    images={images}
                    onImagesChange={setImages}
                    hintTags={hintTags}
                    onHintTagsChange={setHintTags}
                    location={location}
                    onLocationChange={setLocation}
                    isUploading={isUploading}
                    disabled={isPending}
                  />

                  {/* Analyze button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Button
                      onClick={handleAnalyze}
                      disabled={images.length === 0 || isPending}
                      size="lg"
                      className="w-full py-6 text-base group bg-primary hover:bg-primary/90"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {isUploading
                            ? `Uploading ${images.length} image${images.length > 1 ? "s" : ""}...`
                            : "Analyzing with Gemini..."}
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Analyze Profile
                          {images.length > 0 && (
                            <span className="text-primary-foreground/70">
                              ({images.length} image
                              {images.length > 1 ? "s" : ""})
                            </span>
                          )}
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </motion.div>

                  {/* Error state */}
                  {(analyzeMutation.error || uploadMutation.error) && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-destructive text-sm text-center"
                    >
                      {analyzeMutation.error?.message ||
                        uploadMutation.error?.message ||
                        "Analysis failed. Please try again."}
                    </motion.p>
                  )}
                </motion.div>
              ) : (
                /* ── Results Mode: Side-Prism Layout ─────────────── */
                <motion.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Desktop: Two-column with sticky Side-Prism */}
                  {/* The main column normally carries environment context:
                      weather, nearby places and the mission map. All three
                      require GOOGLE_MAPS_API_KEY / OPENWEATHER_API_KEY, so
                      without those the column collapses to just the reset
                      button while SidePrism holds every result. That reads as
                      a broken page.

                      When there is no environment content, the main column
                      takes the full detail instead and SidePrism is dropped,
                      so the analysis always has somewhere to live. */}
                  <div
                    className={
                      hasEnvContent
                        ? "grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6"
                        : "mx-auto w-full max-w-3xl"
                    }
                  >
                    {/* Left column: Environment context + Map */}
                    <div className="space-y-6 min-w-0">
                      {/* Environment context display */}
                      {result.weatherContext && result.city && (
                        <div className="space-y-4">
                          <WeatherBanner
                            weather={result.weatherContext}
                            city={result.city}
                          />
                          {result.nearbyPlaces &&
                            result.nearbyPlaces.length > 0 && (
                              <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                                  Nearby date spots
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
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
                        </div>
                      )}

                      {/* Mission Map + Reset button (main content) */}
                      <AnalyzerResults
                        result={result}
                        onReset={handleReset}
                        userLocation={location}
                        fullDetail={!hasEnvContent}
                      />
                    </div>

                    {/* Right column: Sticky Side-Prism (desktop). Hidden when
                        the main column already shows the full detail. */}
                    <div className={hasEnvContent ? "hidden lg:block" : "hidden"}>
                      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide gradient-mask-b">
                        <SidePrism result={result} sessionId={result.id} />
                      </div>
                    </div>
                  </div>

                  {/* Mobile: Side-Prism rendered inline below */}
                  <div className={hasEnvContent ? "lg:hidden mt-6" : "hidden"}>
                    <SidePrism result={result} sessionId={result.id} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ── Tab 2: Analysis History ─────────────────────────────── */}
          <TabsContent value="history">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <AnalyzerHistoryGrid
                sessions={
                  (historyQuery.data?.items as AnalyzerSessionSummary[]) ?? []
                }
                hasMore={!!historyQuery.data?.nextCursor}
                onLoadMore={handleLoadMore}
                isLoading={historyQuery.isLoading}
              />
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
