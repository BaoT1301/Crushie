"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, ChevronDown } from "lucide-react";
import { LogoMoment } from "@/components/landing/logo-moment";
import { StartFreeButton, SecondaryButton } from "@/components/landing/cta";

/**
 * Hero.
 *
 * Composition is deliberately the original production one: centered stack,
 * logo, eyebrow pill, oversized gradient wordmark, typed subtitle, actions.
 * That opening is the brand and it works, so it is preserved rather than
 * redesigned.
 *
 * What changed is only the parts that were not true. The old proof row read
 * "2,000+ hearts already connected" beside five invented avatars and a 4.9 star
 * rating, none of which exist. Fabricated social proof is the loudest possible
 * signal that a page is not real, and it is the first thing a design-literate
 * visitor discounts. It is replaced with three concrete facts about how the
 * product actually behaves, which fills the same slot and survives scrutiny.
 */

const TYPED_PHRASES = [
  "your wingman AI",
  "your dating coach",
  "your vibe curator",
  "your confidence builder",
];

/**
 * Types a phrase, holds, deletes, advances. Under prefers-reduced-motion the
 * effect is skipped entirely and the first phrase renders as static text, since
 * a continuously rewriting line is exactly the kind of motion that causes
 * trouble for vestibular and attention sensitivities.
 */
function useTypewriter(phrases: string[], disabled: boolean) {
  const [text, setText] = useState(phrases[0]);
  const [index, setIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (disabled) return;

    const phrase = phrases[index % phrases.length];
    const done = !deleting && text === phrase;
    const cleared = deleting && text === "";

    if (done) {
      const hold = setTimeout(() => setDeleting(true), 1900);
      return () => clearTimeout(hold);
    }

    if (cleared) {
      setDeleting(false);
      setIndex((i) => (i + 1) % phrases.length);
      return;
    }

    const tick = setTimeout(
      () => {
        setText((current) =>
          deleting
            ? phrase.slice(0, current.length - 1)
            : phrase.slice(0, current.length + 1),
        );
      },
      deleting ? 38 : 78,
    );

    return () => clearTimeout(tick);
  }, [text, index, deleting, phrases, disabled]);

  useEffect(() => {
    if (disabled) setText(phrases[0]);
  }, [disabled, phrases]);

  return text;
}

/* Three true statements, replacing the invented metrics. */
const FACTS = [
  "Any dating app",
  "About ninety seconds",
  "You edit before you send",
];

export function Hero() {
  const reduceMotion = useReducedMotion();
  const typed = useTypewriter(TYPED_PHRASES, Boolean(reduceMotion));

  return (
    <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-20 sm:px-6">
      <div className="flex w-full max-w-3xl flex-col items-center gap-7 text-center">
        <LogoMoment />

        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm text-foreground backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          AI-Powered Dating Academy
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="font-display bg-gradient-to-br from-white via-pink-300 to-primary bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-7xl lg:text-8xl"
        >
          Crushie
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg text-muted-foreground sm:text-xl"
        >
          Not just another dating app. We are{" "}
          <span className="font-semibold text-primary">{typed}</span>
          {!reduceMotion && (
            <motion.span
              aria-hidden
              className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 bg-primary"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.62, repeat: Infinity }}
            />
          )}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.54, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-1 flex flex-wrap items-center justify-center gap-3"
        >
          <StartFreeButton />
          <SecondaryButton href="#analyzer">See what it makes</SecondaryButton>
        </motion.div>

        {/* Honest replacement for the invented stat row. */}
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75, duration: 0.7 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground"
        >
          {FACTS.map((fact, i) => (
            <li key={fact} className="flex items-center gap-3">
              {i > 0 && (
                <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
              )}
              {fact}
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.a
        href="#analyzer"
        aria-label="Skip to what Crushie produces"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        /* grid place-items-center + a 44px box rather than p-2, so the cue is
           a real touch target. bottom offset also clears the iOS home
           indicator, which otherwise sits right on top of it. */
        className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] grid h-11 w-11 place-items-center rounded-full text-muted-foreground/50 transition-colors hover:text-primary"
      >
        <motion.span
          className="block"
          animate={reduceMotion ? undefined : { y: [0, 7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </motion.a>
    </section>
  );
}
