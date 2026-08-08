"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HINT_TAG_CATEGORIES, type HintTagCategory } from "@/types/analyzer";
import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

interface HintTagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  maxTags?: number;
  disabled?: boolean;
  /** Custom categories to use instead of the default HINT_TAG_CATEGORIES */
  categories?: HintTagCategory[];
  /** Custom label for the section header */
  label?: string;
}

// ============================================================================
// Component
// ============================================================================

export function HintTagSelector({
  selectedTags,
  onTagsChange,
  maxTags = 20,
  disabled = false,
  categories = HINT_TAG_CATEGORIES,
  label = "Hint Tags",
}: HintTagSelectorProps) {
  const [customInput, setCustomInput] = useState("");

  const toggleTag = (tag: string) => {
    if (disabled) return;

    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else if (selectedTags.length < maxTags) {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const addCustomTag = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selectedTags.length >= maxTags || disabled) return;
    if (selectedTags.includes(trimmed)) {
      setCustomInput("");
      return;
    }
    onTagsChange([...selectedTags, trimmed]);
    setCustomInput("");
  };

  const removeTag = (tag: string) => {
    if (disabled) return;
    onTagsChange(selectedTags.filter((t) => t !== tag));
  };

  const atLimit = selectedTags.length >= maxTags;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground">
          {label}
          <span className="text-muted-foreground ml-1 font-normal">
            (optional)
          </span>
        </label>
        <span className="text-xs text-muted-foreground">
          {selectedTags.length}/{maxTags}
        </span>
      </div>

      {/* Predefined categories */}
      <div className="space-y-3">
        {categories.map((category) => (
          <div key={category.label}>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <span>{category.emoji}</span>
              {category.label}
            </p>
            <div className="flex flex-wrap gap-1.5 pointer-coarse:gap-2">
              {category.tags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    disabled={disabled || (!isSelected && atLimit)}
                    className={cn(
                      // These chips were 30px tall. There are ~30 of them in a
                      // dense wrap, so a mis-tap selects the wrong tag rather
                      // than nothing. Full height on touch, original density
                      // under a cursor.
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 pointer-coarse:min-h-11",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/50 text-secondary-foreground border-border hover:bg-secondary hover:border-primary/30",
                      (disabled || (!isSelected && atLimit)) &&
                        "opacity-40 cursor-not-allowed",
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Custom tag input */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <span>✏️</span>
          Custom context
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTag();
              }
            }}
            placeholder="Add extra context..."
            disabled={disabled || atLimit}
            className={cn(
              // text-base below md, matching ui/input.tsx: iOS Safari zooms the
              // page on focus for any field under 16px, and never zooms back
              // out on its own.
              "flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-base text-foreground md:text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
              "transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <Button
            onClick={addCustomTag}
            disabled={!customInput.trim() || atLimit || disabled}
            size="default"
            variant="default"
          >
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Selected tags summary */}
      {selectedTags.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Selected tags:</p>
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence>
              {selectedTags.map((tag) => (
                <motion.span
                  key={tag}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-foreground px-3 py-1.5 rounded-full text-xs font-medium"
                >
                  {tag}
                  {!disabled && (
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
