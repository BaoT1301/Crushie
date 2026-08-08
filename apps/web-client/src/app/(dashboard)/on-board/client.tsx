"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Camera,
  MessageCircle,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { StepProgress } from "@/components/ui/step-progress";
import { MultiImageUploader, type ImagePreview } from "@/components/analyzer";
import { VibeQuizStep } from "@/components/onboard/vibe-quiz-step";
import { VibeResultCard } from "@/components/onboard/vibe-result-card";
import { InlineError } from "@/components/error-display";
import { FloatingHearts } from "@/components/love-animations";
import { VIBE_TAG_CATEGORIES } from "@/types/vibe-onboard";
import type { VibeProfileResult } from "@/types/vibe-onboard";
import { AmbientBackground } from "@/components/ambient-background";

// ============================================================================
// Constants
// ============================================================================

const STEP_LABELS = ["Photos", "Your Vibe", "Reveal"];
const STEP_ICONS = [Camera, MessageCircle, Sparkles] as const;
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY = 500;

// ============================================================================
// Slide animation variants
// ============================================================================

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 },
  }),
};

// ============================================================================
// Client Component
// ============================================================================

export default function OnBoardClient() {
  const router = useRouter();
  const trpc = useTRPC();

  // ── Step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);

  // ── Form state ─────────────────────────────────────────────────────
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [hintTags, setHintTags] = useState<string[]>([]);
  const [extraContext, setExtraContext] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ── Check if user already has a profile ────────────────────────────
  const profileQuery = useQuery(trpc.vibeProfiles.getMe.queryOptions());

  // ── Upload + Generate mutations ────────────────────────────────────
  const uploadMutation = useMutation(
    trpc.uploads.uploadOnboardImage.mutationOptions(),
  );
  const generateMutation = useMutation(trpc.llm.generateVibe.mutationOptions());

  const isPending = isUploading || generateMutation.isPending;

  // Declared here rather than further down with the other derived state:
  // goToStep reads it, so it has to exist before the dependency array below is
  // evaluated. It was previously defined ~110 lines later and simply left out
  // of the deps, which worked only by accident — setStep(2) also changes
  // `step`, so the callback happened to be recreated anyway. Any later edit
  // that decoupled those two would have silently broken the step-2 guard.
  const generatedProfile = generateMutation.data?.profile as
    | VibeProfileResult
    | undefined;

  // ── Navigation ─────────────────────────────────────────────────────

  const goToStep = useCallback(
    (target: number) => {
      if (target < 0 || target > 2) return;
      // Don't allow skipping past step 0 without images
      if (target >= 1 && images.length === 0) return;
      // Don't allow going to step 2 (reveal) manually — only via submit
      if (target === 2 && !generatedProfile) return;
      setDirection(target > step ? 1 : -1);
      setStep(target);
    },
    [step, images.length, generatedProfile],
  );

  const goNext = useCallback(() => {
    if (step === 0 && images.length === 0) return;
    if (step < 1) {
      setDirection(1);
      setStep(step + 1);
    }
  }, [step, images.length]);

  const goBack = useCallback(() => {
    if (step > 0 && step < 2) {
      setDirection(-1);
      setStep(step - 1);
    }
  }, [step]);

  // ── Swipe handler ──────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (step === 2) return; // No swiping on reveal
      if (
        info.offset.x < -SWIPE_THRESHOLD ||
        info.velocity.x < -SWIPE_VELOCITY
      ) {
        goNext();
      } else if (
        info.offset.x > SWIPE_THRESHOLD ||
        info.velocity.x > SWIPE_VELOCITY
      ) {
        goBack();
      }
    },
    [goNext, goBack, step],
  );

  // ── Submit handler ─────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (images.length === 0 || isPending) return;

    try {
      setIsUploading(true);

      // 1. Upload all images to Supabase Storage (parallel)
      const uploadResults = await Promise.all(
        images.map(async (img: { file: File; preview: string }) => {
          const buffer = await img.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce(
              (d, byte) => d + String.fromCharCode(byte),
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

      const imageUrls = uploadResults.map((r: { url: string }) => r.url);

      // 2. Generate vibe via LLM (Gemini 2.5 Flash multimodal)
      generateMutation.mutate(
        {
          imageUrls,
          hintTags: hintTags.length > 0 ? hintTags : undefined,
          extraContext: extraContext.trim() || undefined,
        },
        {
          onSuccess: () => {
            // Transition to the Big Reveal (step 2)
            setDirection(1);
            setStep(2);
          },
        },
      );
    } catch {
      setIsUploading(false);
    }
  };

  // ── Reset & Continue ───────────────────────────────────────────────

  const handleReset = () => {
    generateMutation.reset();
    setDirection(-1);
    setStep(0);
    setImages([]);
    setHintTags([]);
    setExtraContext("");
  };

  const handleContinue = () => {
    router.push("/");
  };

  // ── Derived state ──────────────────────────────────────────────────

  const existingProfile = profileQuery.data as VibeProfileResult | undefined;
  const activeProfile = generatedProfile ?? undefined;

  const errorMsg =
    generateMutation.error?.message || uploadMutation.error?.message || null;

  const canProceedFromStep0 = images.length > 0;
  const canSubmitFromStep1 = images.length > 0;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background relative overflow-hidden">
      <AmbientBackground />

      {/* Floating hearts decoration on step 0 */}
      {step === 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
          <FloatingHearts count={6} />
        </div>
      )}

      {/* Content */}
      {/* pb-fixed-bar reserves the height of the bottom-fixed StepProgress bar
          plus env(safe-area-inset-bottom). The flat pb-24 it replaces was a
          hair short of the bar once the home-indicator inset is added, which
          left the last control partly under it on notched iPhones. */}
      <div className="relative z-10 container max-w-5xl mx-auto px-4 py-6 md:py-10 pb-fixed-bar md:pb-10">
        {/* Desktop layout: sidebar + main */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* ── Desktop Sidebar ─────────────────────────────────── */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Step progress */}
              <GlassCard variant="subtle" className="p-5">
                <div className="space-y-4">
                  {STEP_LABELS.map((label, i) => {
                    const Icon = STEP_ICONS[i];
                    const isActive = i === step;
                    const isComplete = i < step;

                    return (
                      <button
                        key={label}
                        onClick={() => goToStep(i)}
                        disabled={
                          (i === 2 && !activeProfile) ||
                          (i >= 1 && images.length === 0)
                        }
                        className={`flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : isComplete
                              ? "text-foreground/80 hover:bg-muted/50"
                              : "text-muted-foreground"
                        } ${i > step && !isComplete ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full ${
                            isComplete
                              ? "bg-primary text-primary-foreground"
                              : isActive
                                ? "bg-primary/20 text-primary border border-primary/40"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">{label}</span>
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </GlassCard>

              {/* Motivational text */}
              <GlassCard variant="subtle" className="p-4">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={step}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-sm text-muted-foreground leading-relaxed"
                  >
                    {step === 0
                      ? "Upload photos that capture your personality. The AI needs visuals to understand your energy."
                      : step === 1
                        ? "Select the tags that resonate with you. This context helps generate a more accurate vibe."
                        : "Your unique vibe has been crafted! Share it with the world or regenerate for a fresh take."}
                  </motion.p>
                </AnimatePresence>
              </GlassCard>

              {/* Existing profile notice */}
              {existingProfile && !activeProfile && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 rounded-xl bg-secondary/50 border border-border px-3 py-2.5 text-xs text-muted-foreground"
                >
                  <span className="h-2 w-2 rounded-full bg-primary animate-glow-pulse flex-shrink-0" />
                  <span>
                    Current vibe:{" "}
                    <strong className="text-foreground">
                      {existingProfile.vibeName}
                    </strong>
                  </span>
                </motion.div>
              )}
            </div>
          </aside>

          {/* ── Main Content Area ───────────────────────────────── */}
          <main className="min-w-0">
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
                  {step === 2 ? "Your Vibe" : "Discovery Adventure"}
                </h1>
              </div>
              <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
                {step === 0
                  ? "Start by uploading photos that capture your essence"
                  : step === 1
                    ? "Now tell us what makes you, you"
                    : ""}
              </p>

              {/* Mobile: Existing profile notice */}
              {existingProfile && !activeProfile && step < 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="lg:hidden mt-3 inline-flex items-center gap-2 rounded-full bg-secondary/50 border border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-glow-pulse" />
                  Current:{" "}
                  <strong className="text-foreground">
                    {existingProfile.vibeName}
                  </strong>
                </motion.div>
              )}
            </motion.div>

            {/* Step content with swipe support */}
            <AnimatePresence mode="wait" custom={direction}>
              {step === 0 && (
                <motion.div
                  key="step-photos"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  drag={step < 2 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={handleDragEnd}
                  className="will-change-transform"
                >
                  <GlassCard variant="medium" className="p-5 md:p-8">
                    <div className="space-y-6">
                      {/* Section header */}
                      <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
                          <Camera className="w-4 h-4" />
                          Step 1 of 3
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold text-foreground">
                          Show Us Your Vibe
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Upload 1–10 photos that best represent you
                        </p>
                      </div>

                      {/* Image uploader */}
                      <MultiImageUploader
                        images={images}
                        onImagesChange={setImages}
                        maxImages={10}
                        minImages={1}
                        disabled={isPending}
                      />

                      {/* Next button */}
                      <div className="flex justify-end">
                        <Button
                          onClick={goNext}
                          disabled={!canProceedFromStep0}
                          size="lg"
                          className="px-8 group"
                        >
                          Next: Your Vibe
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step-quiz"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={handleDragEnd}
                  className="will-change-transform"
                >
                  <GlassCard variant="medium" className="p-5 md:p-8">
                    <div className="space-y-6">
                      {/* Section header */}
                      <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
                          <MessageCircle className="w-4 h-4" />
                          Step 2 of 3
                        </div>
                      </div>

                      {/* Vibe Quiz */}
                      <VibeQuizStep
                        categories={VIBE_TAG_CATEGORIES}
                        selectedTags={hintTags}
                        onTagsChange={setHintTags}
                        extraContext={extraContext}
                        onExtraContextChange={setExtraContext}
                        disabled={isPending}
                      />

                      {/* Navigation */}
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <Button
                          onClick={goBack}
                          variant="outline"
                          size="lg"
                          className="gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </Button>

                        <Button
                          onClick={handleSubmit}
                          disabled={!canSubmitFromStep1 || isPending}
                          size="lg"
                          className="px-8 group bg-primary hover:bg-primary/90"
                        >
                          {isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              {isUploading
                                ? `Uploading ${images.length} photo${images.length > 1 ? "s" : ""}...`
                                : "Generating your vibe..."}
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              Generate My Vibe
                              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Error display */}
                      {errorMsg && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center"
                        >
                          <InlineError message={errorMsg} />
                        </motion.div>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              )}

              {step === 2 && activeProfile && (
                <motion.div
                  key="step-reveal"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5 }}
                >
                  <VibeResultCard
                    profile={activeProfile}
                    onReset={handleReset}
                    onContinue={handleContinue}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Mobile bottom step progress */}
      {step < 2 && (
        <StepProgress
          currentStep={step}
          totalSteps={3}
          labels={STEP_LABELS}
          onStepTap={(s) => goToStep(s)}
        />
      )}
    </div>
  );
}
