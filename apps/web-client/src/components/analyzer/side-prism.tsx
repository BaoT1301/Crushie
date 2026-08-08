"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { StyleBadge } from "./style-badge";
import { ConversationOpenersCard } from "./conversation-openers-card";
import { ContextBar } from "./context-bar";
import type {
  AnalyzerResult,
  VibePrediction,
  PredictedStyle,
  DateSuggestion,
} from "@/types/analyzer";
import { STYLE_CONFIG } from "@/types/analyzer";

// ============================================================================
// Types
// ============================================================================

interface SidePrismProps {
  result: AnalyzerResult;
  sessionId: string;
  className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function CompactVibeAnalysis({
  vibePrediction,
  predictedStyle,
}: {
  vibePrediction: VibePrediction;
  predictedStyle: PredictedStyle;
}) {
  const config = STYLE_CONFIG[predictedStyle];

  return (
    <div className="space-y-3">
      {/* Confidence meter */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Confidence
          </span>
          <span className="text-primary font-semibold text-sm">
            {Math.round(vibePrediction.confidence * 100)}%
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${vibePrediction.confidence * 100}%` }}
            transition={{ duration: 1, delay: 0.3 }}
            className={`h-full bg-linear-to-r ${config.gradient} rounded-full`}
          />
        </div>
      </div>

      {/* Traits compact */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Primary
          </p>
          <p className="text-xs font-semibold text-foreground truncate">
            {vibePrediction.dominantTrait}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Secondary
          </p>
          <p className="text-xs font-semibold text-foreground truncate">
            {vibePrediction.secondaryTrait}
          </p>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-foreground/70 leading-relaxed line-clamp-3">
        {vibePrediction.summary}
      </p>

      {/* Tips — compact list */}
      {vibePrediction.communicationTips.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Tips
          </p>
          {vibePrediction.communicationTips.slice(0, 3).map((tip, i) => (
            <p
              key={i}
              className="text-xs text-foreground/70 flex items-start gap-1.5"
            >
              <span className="text-primary mt-0.5">•</span>
              <span className="line-clamp-2">{tip}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactDateSuggestions({
  suggestions,
  predictedStyle,
}: {
  suggestions: DateSuggestion[];
  predictedStyle: PredictedStyle;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const config = STYLE_CONFIG[predictedStyle];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Date Missions ({suggestions.length})
      </h4>
      {suggestions.map((date, i) => {
        const isExpanded = expandedIndex === i;

        return (
          <div
            key={i}
            className="bg-muted/50 rounded-lg overflow-hidden border border-border/30"
          >
            <button
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-foreground truncate">
                  {date.title}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-primary font-semibold">
                  {Math.round(date.vibeMatch * 100)}%
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2 border-t border-border/20 pt-2">
                    <p className="text-xs text-foreground/70">
                      {date.description}
                    </p>

                    {date.placeName && (
                      <p className="text-[10px] text-primary font-medium">
                        📍 {date.placeName}
                      </p>
                    )}

                    {date.icebreakerQuestion && (
                      <div className="bg-background/50 rounded-md px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase">
                          Icebreaker
                        </p>
                        <p className="text-xs text-foreground">
                          {date.icebreakerQuestion}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>💰 {date.estimatedCost}</span>
                      <span>⏱ {date.duration}</span>
                    </div>

                    {/* Vibe match micro-bar */}
                    <div className="h-1 bg-background rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${date.vibeMatch * 100}%` }}
                        transition={{ duration: 0.8 }}
                        className={`h-full bg-linear-to-r ${config.gradient} rounded-full`}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// SidePrism Main Component
// ============================================================================

export function SidePrism({ result, sessionId, className }: SidePrismProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Context bar */}
      {(result.weatherContext || result.city) && (
        <ContextBar weather={result.weatherContext} city={result.city} />
      )}

      {/* Main prism card */}
      <GlassCard variant="strong" glowColor="rose" className="overflow-hidden">
        {/* Top gradient accent */}
        <div className="h-1 bg-linear-to-r from-primary/50 to-primary/20" />

        <div className="p-4 md:p-5 space-y-5">
          {/* Style badge — compact */}
          <div className="text-center">
            <StyleBadge style={result.predictedStyle} />
          </div>

          {/* Vibe analysis — compact */}
          <CompactVibeAnalysis
            vibePrediction={result.vibePrediction}
            predictedStyle={result.predictedStyle}
          />

          {/* Divider */}
          <div className="h-px bg-border/50" />

          {/* Conversation openers — message bubbles */}
          <ConversationOpenersCard
            openers={result.conversationOpeners}
            compact
          />

          {/* Divider */}
          {result.dateSuggestions.length > 0 && (
            <>
              <div className="h-px bg-border/50" />

              {/* Date suggestions — collapsible accordion */}
              <CompactDateSuggestions
                suggestions={result.dateSuggestions}
                predictedStyle={result.predictedStyle}
              />
            </>
          )}

          {/* Simulator CTA */}
          {sessionId && (
            <>
              <div className="h-px bg-border/50" />
              <Link href={`/analyze-profile/${sessionId}/simulator`}>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-2"
                  size="sm"
                >
                  <Sparkles className="w-4 h-4" />
                  Launch AR Coaching
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
