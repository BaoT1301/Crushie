"use client";

import { motion } from "framer-motion";
import { MapPin, Heart, DollarSign, Clock, Navigation } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { DateSuggestion, PredictedStyle } from "@/types/analyzer";
import { STYLE_CONFIG } from "@/types/analyzer";

interface DateSuggestionsCardProps {
  suggestions: DateSuggestion[];
  predictedStyle: PredictedStyle;
}

export function DateSuggestionsCard({
  suggestions,
  predictedStyle,
}: DateSuggestionsCardProps) {
  const config = STYLE_CONFIG[predictedStyle];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary" />
            <span>Date Missions</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({suggestions.length} ideas)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {suggestions.map((date, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="bg-muted rounded-xl p-5 hover:bg-accent transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {i + 1}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {date.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <Heart className="w-4 h-4 text-primary" />
                    <span className="text-primary font-semibold">
                      {Math.round(date.vibeMatch * 100)}%
                    </span>
                  </div>
                </div>

                <p className="text-foreground/80 mb-4">{date.description}</p>

                {/* Venue info */}
                {date.placeName && (
                  <div className="flex items-center gap-1.5 text-sm text-primary mb-2">
                    <Navigation className="w-3.5 h-3.5" />
                    <span className="font-medium">{date.placeName}</span>
                    {date.whyThisSpot && (
                      <span className="text-muted-foreground">
                        — {date.whyThisSpot}
                      </span>
                    )}
                  </div>
                )}

                {date.icebreakerQuestion && (
                  <div className="mb-3 rounded-lg border bg-background/70 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Icebreaker
                    </p>
                    <p className="text-sm text-foreground">
                      {date.icebreakerQuestion}
                    </p>
                  </div>
                )}

                {date.followUpQuestions &&
                  date.followUpQuestions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Follow-ups
                      </p>
                      <ul className="space-y-1">
                        {date.followUpQuestions
                          .slice(0, 3)
                          .map((question, questionIndex) => (
                            <li
                              key={questionIndex}
                              className="text-sm text-foreground/90"
                            >
                              • {question}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                {(date.topicCues?.length ||
                  date.doTips?.length ||
                  date.avoidTips?.length ||
                  date.bestTimingCue) && (
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    {date.topicCues && date.topicCues.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Topic cues
                        </p>
                        <p className="text-sm text-foreground/90">
                          {date.topicCues.slice(0, 4).join(" • ")}
                        </p>
                      </div>
                    )}

                    {date.bestTimingCue && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Best timing
                        </p>
                        <p className="text-sm text-foreground/90">
                          {date.bestTimingCue}
                        </p>
                      </div>
                    )}

                    {date.doTips && date.doTips.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Do
                        </p>
                        <p className="text-sm text-foreground/90">
                          {date.doTips.slice(0, 3).join(" • ")}
                        </p>
                      </div>
                    )}

                    {date.avoidTips && date.avoidTips.length > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                          Avoid
                        </p>
                        <p className="text-sm text-foreground/90">
                          {date.avoidTips.slice(0, 3).join(" • ")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    <DollarSign className="w-4 h-4" />
                    <span>{date.estimatedCost}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{date.duration}</span>
                  </div>
                </div>

                {/* Vibe Match Bar */}
                <div className="mt-4">
                  <div className="h-1 bg-background rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${date.vibeMatch * 100}%` }}
                      transition={{ duration: 1, delay: 0.6 + i * 0.1 }}
                      className={`h-full bg-linear-to-r ${config.gradient} rounded-full`}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
