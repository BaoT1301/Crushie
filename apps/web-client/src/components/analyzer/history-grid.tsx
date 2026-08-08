"use client";

import { formatDistanceToNow } from "date-fns";
import { Clock, MapPin, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StyleBadge } from "./style-badge";
import type { AnalyzerSessionSummary, PredictedStyle } from "@/types/analyzer";

interface AnalyzerHistoryGridProps {
  sessions: AnalyzerSessionSummary[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function AnalyzerHistoryGrid({
  sessions,
  hasMore,
  onLoadMore,
  isLoading,
}: AnalyzerHistoryGridProps) {
  if (sessions.length === 0 && !isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <p className="text-sm font-medium">No analysis history yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run your first vibe check to see beautiful session cards here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session, idx) => (
          <motion.div
            key={session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Link href={`/analyze-profile/${session.id}`}>
              <Card className="group h-full border-border/70 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <CardContent className="p-4 space-y-3">
                  {/* Style + time */}
                  <div className="flex items-center justify-between">
                    <StyleBadge
                      style={session.predictedStyle as PredictedStyle}
                    />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(session.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  {/* Vibe summary preview */}
                  <p className="line-clamp-2 text-sm leading-6 text-foreground/85">
                    {(
                      session.vibePrediction as {
                        summary?: string;
                      }
                    )?.summary ?? "Analysis complete"}
                  </p>

                  {/* City + arrow */}
                  <div className="flex items-center justify-between">
                    {session.city ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {session.city}
                      </span>
                    ) : (
                      <span />
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}

        {/* Loading skeleton cards */}
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={`skel-${i}`}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="text-center pt-2">
          <Button
            onClick={onLoadMore}
            variant="outline"
            className="border-primary/30 hover:bg-primary/10"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
