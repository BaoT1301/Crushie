"use client";

import { motion } from "framer-motion";
import { Heart, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { VibePrediction, PredictedStyle } from "@/types/analyzer";
import { STYLE_CONFIG } from "@/types/analyzer";

interface VibeAnalysisCardProps {
  vibePrediction: VibePrediction;
  predictedStyle: PredictedStyle;
}

export function VibeAnalysisCard({
  vibePrediction,
  predictedStyle,
}: VibeAnalysisCardProps) {
  const config = STYLE_CONFIG[predictedStyle];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-primary" />
            <span>Vibe Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Confidence Meter */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground text-sm">Confidence</span>
              <span className="text-primary font-semibold">
                {Math.round(vibePrediction.confidence * 100)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${vibePrediction.confidence * 100}%`,
                }}
                transition={{ duration: 1, delay: 0.3 }}
                className={`h-full bg-linear-to-r ${config.gradient} rounded-full`}
              />
            </div>
          </div>

          {/* Traits */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-xl p-4">
              <p className="text-muted-foreground text-sm mb-1">
                Dominant Trait
              </p>
              <p className="text-foreground font-semibold">
                {vibePrediction.dominantTrait}
              </p>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <p className="text-muted-foreground text-sm mb-1">
                Secondary Trait
              </p>
              <p className="text-foreground font-semibold">
                {vibePrediction.secondaryTrait}
              </p>
            </div>
          </div>

          {/* Summary */}
          <p className="text-foreground/80 leading-relaxed">
            {vibePrediction.summary}
          </p>

          {/* Communication Tips */}
          <div>
            <h3 className="text-foreground font-semibold mb-3">
              Communication Tips
            </h3>
            <div className="space-y-2">
              {vibePrediction.communicationTips.map((tip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-start gap-3 text-foreground/80"
                >
                  <Zap className="w-4 h-4 text-primary mt-1 shrink-0" />
                  <span>{tip}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
