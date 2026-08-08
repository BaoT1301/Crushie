"use client";

import { useCallback, useId, useRef } from "react";
import { Upload, X, ImagePlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface ImagePreview {
  file: File;
  preview: string;
}

interface MultiImageUploaderProps {
  images: ImagePreview[];
  onImagesChange: (images: ImagePreview[]) => void;
  maxImages?: number;
  minImages?: number;
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function MultiImageUploader({
  images,
  onImagesChange,
  maxImages = 10,
  minImages = 1,
  disabled = false,
}: MultiImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      const remaining = maxImages - images.length;
      const toAdd = fileArray.slice(0, remaining);

      if (toAdd.length === 0) return;

      const newPreviews: ImagePreview[] = [];

      let loaded = 0;
      toAdd.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push({ file, preview: reader.result as string });
          loaded++;
          if (loaded === toAdd.length) {
            onImagesChange([...images, ...newPreviews]);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [images, maxImages, onImagesChange],
  );

  const removeImage = useCallback(
    (index: number) => {
      const updated = images.filter((_, i) => i !== index);
      onImagesChange(updated);
    },
    [images, onImagesChange],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const canAddMore = images.length < maxImages && !disabled;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-foreground"
        >
          Upload Profile Screenshots
        </label>
        <span className="text-xs text-muted-foreground">
          {images.length}/{maxImages} images
          {minImages > 0 && images.length < minImages && (
            <span className="text-destructive ml-1">
              (min {minImages} required)
            </span>
          )}
        </span>
      </div>

      {/* `sr-only`, not `hidden`: display:none removes the input from the tab
          order entirely, so a keyboard user had no way into the file picker.
          sr-only keeps it focusable and label-addressable while invisible. */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        onChange={handleFileInput}
        className="sr-only"
        disabled={!canAddMore}
      />

      {/* Image preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <AnimatePresence>
            {images.map((img, index) => (
              <motion.div
                key={`${img.file.name}-${index}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group"
              >
                <img
                  src={img.preview}
                  alt={`Screenshot ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {!disabled && (
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-background/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="absolute bottom-0 inset-x-0 h-6 bg-linear-to-t from-black/40 to-transparent flex items-end justify-center pb-0.5">
                  <span className="text-[10px] font-medium text-white/80">
                    {index + 1}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add more button (inside grid) */}
          {canAddMore && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => inputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs">Add</span>
            </motion.button>
          )}
        </div>
      )}

      {/* Empty state drop zone */}
      {images.length === 0 && (
        <button
          type="button"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => canAddMore && inputRef.current?.click()}
          disabled={!canAddMore}
          aria-controls={inputId}
          className={cn(
            "relative flex flex-col items-center justify-center w-full h-56",
            "border-2 border-dashed rounded-2xl cursor-pointer",
            "transition-all duration-300 group",
            "border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {/* Spans, not divs/paragraphs: <button> only accepts phrasing
              content, and the drop zone has to stay a real button so the
              keyboard and voice control reach it. */}
          <motion.span
            className="block"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Upload className="w-12 h-12 text-muted-foreground group-hover:text-foreground transition-colors mx-auto mb-3" />
          </motion.span>
          <span className="block text-foreground font-medium mb-1">
            Drop screenshots here
          </span>
          <span className="block text-muted-foreground text-sm">
            or click to browse
          </span>
          <span className="block text-muted-foreground text-xs mt-3">
            PNG, JPG, WebP, HEIC — up to 10MB each — {minImages}-{maxImages}{" "}
            images
          </span>
        </button>
      )}
    </div>
  );
}
