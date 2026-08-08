"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Quote, MapPin, Clock, Sparkles, Heart } from "lucide-react";

/**
 * Analyzer preview.
 *
 * A real component preview, not a mocked screenshot: it renders the exact
 * `LLMAnalyzerData` shape the LLM service returns (see services/llm/client.ts).
 *
 * It cycles through the five communication styles the analyzer can actually
 * predict, which does two jobs at once. It keeps the artwork alive instead of
 * static, and it communicates range: the same product produces a genuinely
 * different read and a different plan depending on who you point it at. Each
 * variant carries its own openers and its own date suggestion, because
 * swapping only the label would be a lie about how the product behaves.
 *
 * Under prefers-reduced-motion the carousel stops advancing and the first
 * variant renders statically, since auto-advancing content is exactly what
 * WCAG 2.2.2 asks you to be able to stop.
 *
 * Radius: surface = rounded-2xl, inner block = rounded-xl, pill = full.
 */

type Variant = {
  style: string;
  confidence: number;
  openers: [string, string];
  date: {
    title: string;
    placeName: string;
    why: string;
    vibeMatch: number;
    duration: string;
  };
};

const VARIANTS: Variant[] = [
  {
    style: "playful",
    confidence: 0.82,
    openers: [
      "That bookshop photo has three Le Guin spines. Which one converted you?",
      "Genuine question: is the ceramics a hobby or a quiet second career?",
    ],
    date: {
      title: "Pottery night, then noodles",
      placeName: "Clay & Co. Studio",
      why: "Hands stay busy, so silences stop feeling like silences.",
      vibeMatch: 89,
      duration: "2 hours",
    },
  },
  {
    style: "romantic",
    confidence: 0.78,
    openers: [
      "You photograph everything at golden hour. Is that on purpose or are you just always out then?",
      "Your bio says you cry at films. What was the last one that got you?",
    ],
    date: {
      title: "Rooftop at sunset, dinner after",
      placeName: "The Lantern Terrace",
      why: "Somewhere with a view buys you a natural pause to actually look at each other.",
      vibeMatch: 94,
      duration: "3 hours",
    },
  },
  {
    style: "intellectual",
    confidence: 0.86,
    openers: [
      "Three of your five photos are in museums. What is the last thing that genuinely changed your mind?",
      "Your shelf has Borges next to a statistics textbook. I need the story there.",
    ],
    date: {
      title: "Late gallery, then a quiet bar",
      placeName: "Hartley Modern",
      why: "Gives you something specific to disagree about before the small talk runs out.",
      vibeMatch: 91,
      duration: "3 hours",
    },
  },
  {
    style: "adventurous",
    confidence: 0.84,
    openers: [
      "Two continents in four photos. Which one did you almost not come back from?",
      "The climbing shot looks like a real route, not a gym wall. Where was that?",
    ],
    date: {
      title: "Bouldering, then street food",
      placeName: "Northside Climb",
      why: "Doing something slightly hard together skips about three dates of small talk.",
      vibeMatch: 87,
      duration: "2 hours",
    },
  },
  {
    style: "shy",
    confidence: 0.73,
    openers: [
      "Your dog is clearly the extrovert of the household. What is their name?",
      "You mentioned you are better over text at first. Noted, and completely fair.",
    ],
    date: {
      title: "Bookshop cafe, no pressure",
      placeName: "Marlow & Sons",
      why: "Somewhere with a built in exit and plenty to look at takes the weight off.",
      vibeMatch: 82,
      duration: "1 hour",
    },
  },
];

const CYCLE_MS = 5200;

export function AnalyzerPreview() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % VARIANTS.length),
      CYCLE_MS,
    );
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const v = VARIANTS[index];

  return (
    <div className="relative w-full max-w-md">
      {/* Bloom behind the card, matching the logo halo. */}
      <div
        aria-hidden
        className="ambient-drift absolute -inset-10 -z-10 rounded-full bg-primary/12 blur-[80px]"
      />

      {/* Gradient hairline: a 1px brand ramp around the whole surface. */}
      <div className="rounded-2xl bg-gradient-to-br from-primary via-pink-500 to-rose-500 p-px shadow-2xl shadow-primary/25">
        <div className="overflow-hidden rounded-2xl bg-card">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary/15 via-pink-500/10 to-transparent px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Predicted communication style
              </span>
              <div className="relative h-7">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={v.style}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display absolute inset-x-0 top-0 bg-gradient-to-r from-primary to-rose-400 bg-clip-text text-xl font-semibold capitalize text-transparent"
                  >
                    {v.style}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            <motion.span
              key={`conf-${v.style}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-medium tabular-nums text-primary"
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {Math.round(v.confidence * 100)}%
            </motion.span>
          </div>

          {/* Openers */}
          <div className="flex flex-col gap-3 px-5 py-5">
            <div className="flex items-center gap-2">
              <Quote className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="text-xs font-medium text-muted-foreground">
                Openers written for this profile
              </span>
            </div>

            <div className="flex min-h-[9.5rem] flex-col gap-3">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={v.style}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col gap-3"
                >
                  {v.openers.map((opener, i) => (
                    <motion.p
                      key={opener}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: i * 0.12,
                        duration: 0.45,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="rounded-xl border-l-2 border-primary/60 bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-foreground"
                    >
                      {opener}
                    </motion.p>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Date suggestion */}
          <div className="border-t border-border/60 bg-gradient-to-br from-primary/[0.08] to-transparent px-5 py-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={v.style}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-sm font-semibold text-foreground">
                      {v.date.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin
                          className="h-3 w-3 text-primary/70"
                          aria-hidden
                        />
                        {v.date.placeName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary/70" aria-hidden />
                        {v.date.duration}
                      </span>
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-primary to-rose-500 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-md shadow-primary/30">
                    <Heart className="h-3 w-3 fill-current" aria-hidden />
                    {v.date.vibeMatch}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {v.date.why}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Variant selector. Real controls, so the carousel satisfies the
          "pause, stop, hide" expectation for auto-advancing content. */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {VARIANTS.map((variant, i) => (
          <button
            key={variant.style}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${variant.style} example`}
            aria-current={i === index}
            /* The visible dot is 6px tall; p-1.5 made the whole control 36x18,
               the smallest target on the landing page. The button is now a
               44px square with the dot centred inside, and -my-3 keeps the
               row's spacing where it was. */
            className="group -mx-2 -my-3 grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={
                i === index
                  ? "block h-1.5 w-6 rounded-full bg-primary transition-all"
                  : "block h-1.5 w-1.5 rounded-full bg-border transition-all group-hover:bg-primary/50"
              }
            />
          </button>
        ))}
      </div>

      <p className="mt-1 text-center text-xs text-muted-foreground">
        Sample output. Your results depend on the profile you upload.
      </p>
    </div>
  );
}
