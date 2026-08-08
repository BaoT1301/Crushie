"use client";

import { motion } from "framer-motion";
import { Upload, ImagePlus } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  MultiImageUploader,
  type ImagePreview,
} from "@/components/analyzer/multi-image-uploader";
import { HintTagSelector } from "@/components/analyzer/hint-tag-selector";
import { LocationPicker } from "@/components/analyzer/location-picker";
import type { LocationInput } from "@/types/analyzer";

// ============================================================================
// Types
// ============================================================================

interface AnalyzerUploadZoneProps {
  images: ImagePreview[];
  onImagesChange: (imgs: ImagePreview[]) => void;
  hintTags: string[];
  onHintTagsChange: (tags: string[]) => void;
  location: LocationInput | null;
  onLocationChange: (loc: LocationInput | null) => void;
  isUploading: boolean;
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function AnalyzerUploadZone({
  images,
  onImagesChange,
  hintTags,
  onHintTagsChange,
  location,
  onLocationChange,
  isUploading,
  disabled = false,
}: AnalyzerUploadZoneProps) {
  const hasImages = images.length > 0;

  return (
    <div className="space-y-5">
      {/* Main upload area */}
      <GlassCard
        variant="medium"
        glowColor={hasImages ? "rose" : "none"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden"
      >
        {/* Decorative gradient overlay for empty state */}
        {!hasImages && (
          <div className="absolute inset-0 bg-linear-to-br from-primary/[0.03] via-transparent to-primary/[0.03] pointer-events-none" />
        )}

        <div
          className={`p-5 md:p-8 ${!hasImages ? "min-h-[40dvh] md:min-h-[50dvh] flex flex-col items-center justify-center" : ""}`}
        >
          {/* Empty state hero */}
          {!hasImages && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-6"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4"
              >
                <Upload className="w-8 h-8 text-primary" />
              </motion.div>
              <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1">
                Drop Your Crush&apos;s Screenshot
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload screenshots of their dating profile, social media, or
                chat messages
              </p>
            </motion.div>
          )}

          {/* Compact header when images exist */}
          {hasImages && (
            <div className="flex items-center gap-2 mb-4">
              <ImagePlus className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Screenshots ({images.length})
              </span>
            </div>
          )}

          {/* Multi-image uploader */}
          <MultiImageUploader
            images={images}
            onImagesChange={onImagesChange}
            maxImages={10}
            minImages={1}
            disabled={disabled || isUploading}
          />
        </div>
      </GlassCard>

      {/* Hint tags */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <GlassCard variant="subtle" className="p-5 md:p-6">
          <HintTagSelector
            selectedTags={hintTags}
            onTagsChange={onHintTagsChange}
            maxTags={20}
            disabled={disabled || isUploading}
          />
        </GlassCard>
      </motion.div>

      {/* Location picker */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <GlassCard variant="subtle" className="p-5 md:p-6">
          <LocationPicker
            location={location}
            onLocationChange={onLocationChange}
            disabled={disabled || isUploading}
          />
        </GlassCard>
      </motion.div>
    </div>
  );
}
