"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationOpenersCardProps {
  openers: string[];
  /** Compact mode for Side-Prism layout */
  compact?: boolean;
}

export function ConversationOpenersCard({
  openers,
  compact = false,
}: ConversationOpenersCardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 mb-4",
          compact ? "mb-3" : "mb-4",
        )}
      >
        <MessageSquare
          className={cn("text-primary", compact ? "w-4 h-4" : "w-5 h-5")}
        />
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          Conversation Starters
        </h3>
      </div>

      {/* Message bubbles */}
      <div className="space-y-3">
        {openers.map((opener, i) => {
          const isEven = i % 2 === 0;
          const isCopied = copiedIndex === i;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: isEven ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: 0.4 + i * 0.08,
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
              className={cn(
                "flex will-change-transform",
                isEven ? "justify-start" : "justify-end",
              )}
            >
              <button
                onClick={() => copyToClipboard(opener, i)}
                className={cn(
                  "relative group max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 text-left transition-all duration-200",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // Bubble styles
                  isEven
                    ? "bg-primary text-primary-foreground rounded-bl-sm"
                    : "bg-muted text-foreground rounded-br-sm border border-border/50",
                  // Copied state flash
                  isCopied && "ring-2 ring-green-500/50 bg-green-500/10",
                  // Hover
                  !isCopied && "hover:shadow-md hover:scale-[1.01]",
                )}
              >
                <div className="flex items-start gap-3">
                  <p
                    className={cn(
                      "flex-1",
                      compact ? "text-sm" : "text-sm md:text-base",
                    )}
                  >
                    {opener}
                  </p>
                  <span className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isCopied ? (
                      <Check
                        className={cn(
                          "text-green-400",
                          compact ? "w-3.5 h-3.5" : "w-4 h-4",
                        )}
                      />
                    ) : (
                      <Copy
                        className={cn(
                          compact ? "w-3.5 h-3.5" : "w-4 h-4",
                          isEven
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      />
                    )}
                  </span>
                </div>

                {/* Tap to copy hint */}
                {i === 0 && !copiedIndex && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className={cn(
                      "block text-[10px] mt-1 opacity-50",
                      isEven
                        ? "text-primary-foreground/60"
                        : "text-muted-foreground",
                    )}
                  >
                    Tap to copy
                  </motion.span>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
