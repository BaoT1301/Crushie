"use client";

import { motion } from "framer-motion";
import {
  Camera,
  ScanFace,
  MessageSquareText,
  Mic,
  Trophy,
  ShieldCheck,
  PencilLine,
  KeyRound,
  Eye,
} from "lucide-react";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { Hero } from "@/components/landing/hero";
import { AnalyzerPreview } from "@/components/landing/analyzer-preview";
import { StartFreeButton } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { ClosingMark } from "@/components/landing/closing-mark";
import { PrivacyPanel } from "@/components/landing/privacy-panel";

/* ============================================================================
   Crushie landing page

   Structure: the original production opening is preserved as the hero, since
   that composition is the brand. Everything below it is new.

   Design contract, so this does not drift back:

   - One accent. Everything saturated on this page is --primary rose. No
     purple, amber, emerald or violet card gradients. The exceptions are the
     logo mark and the wordmark, which keep their original pink gradients.
     Those are the brand, not decoration, so they are not subject to the
     single-accent rule the surfaces follow.
   - One radius system. surface = rounded-2xl, inner block = rounded-xl,
     interactive = rounded-full.
   - One ambient idea, in CSS. See .ambient-drift in globals.css.
   - Section headings use weight and size for hierarchy, never gradient text.
     The wordmark is the only gradient type on the page.
   - Zero em-dashes in visible copy.
   - Every number on this page is either true or absent.
   ============================================================================ */

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Reveal presets.
 *
 * One shared object was previously reused verbatim in five sections, so every
 * section entered at exactly the same pace. By the third repeat the eye stops
 * reading it as motion. These vary the tempo so sections stop feeling
 * interchangeable: brisk where the content is a list, slower where it asks the
 * reader to take something seriously.
 */
const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.6, ease: EASE },
};

/** Slower and further. Used where the message needs weight. */
const revealSlow = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.9, ease: EASE },
};

/* Cards lift on a spring rather than a linear transition, so they feel like
   objects being picked up instead of boxes changing value. */
const lift = {
  whileHover: { y: -6 },
  transition: { type: "spring" as const, stiffness: 380, damping: 24 },
};

/* ---------------------------------------------------------------------------
   Ambient background

   Three slow rose washes. This replaces FloatingOrbs (6 nodes), ParticleField
   (40 nodes), FloatingHearts (18 nodes) and GradientMesh (3 nodes). Pure CSS,
   compositor only, no React, no main-thread loop.

   Opacity is kept low on purpose. The page background must read as black, not
   pink. These are corner blooms that hint at the brand; the actual colour on
   this page comes from the components sitting on top (gradient CTA, gradient
   icon chips, tinted bento cells, the analyzer card's gradient hairline). Push
   these past roughly 15% and the whole viewport turns pink, which is not the
   look.
   --------------------------------------------------------------------------- */
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="ambient-drift absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full bg-primary/12 blur-[120px]" />
      <div
        className="ambient-drift absolute top-1/3 -right-40 h-[32rem] w-[32rem] rounded-full bg-rose-500/10 blur-[130px]"
        style={{ animationDelay: "-14s" }}
      />
      <div
        className="ambient-drift absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full bg-pink-500/[0.07] blur-[140px]"
        style={{ animationDelay: "-7s" }}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <Ambient />
      <div
        aria-hidden
        className="grain-overlay pointer-events-none fixed inset-0 z-[60] opacity-[0.035] mix-blend-overlay"
      />
      <MarketingNav />

      <main className="flex-1">
        {/* The original production opening, preserved. */}
        <Hero />

        {/* ==================================================================
            WHAT IT MAKES. The first thing after the hero is the actual
            product output, because for a tool nobody has heard of yet, showing
            the thing beats describing it.
            ================================================================== */}
        <section
          id="analyzer"
          className="section-defer border-t border-border/60 bg-card/10"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8">
            <motion.div {...reveal} className="lg:col-span-6">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
                This is what you actually get.
              </h2>
              <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-pretty text-muted-foreground">
                One screenshot in. A read on how they like to be talked to,
                openers written for that specific profile, and somewhere real to
                take them.
              </p>
            </motion.div>

            <motion.div
              {...reveal}
              className="flex justify-center lg:col-span-6 lg:justify-end"
            >
              <AnalyzerPreview />
            </motion.div>
          </div>
        </section>

        {/* ==================================================================
            HOW IT WORKS. Offset editorial rows, not a three card grid and not
            a numbered step sequence.
            ================================================================== */}
        <section
          id="how-it-works"
          className="section-defer mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8"
        >
          <motion.h2
            {...reveal}
            className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
          >
            Three moves, about ninety seconds.
          </motion.h2>

          {/* Numbered sequence, not a table.
              Three identical rows with a 5/7 split left a dead gap in the
              middle and gave no sense of progression, despite the heading
              promising "three moves". Large ordinals carry the sequence, a
              rule connects them, and each row lifts on hover so the surface
              reads as an object rather than a table cell. */}
          <ol className="mt-14 flex flex-col">
            {[
              {
                icon: Camera,
                title: "Upload the profile",
                body: "One screenshot from whichever app you are already on. No account linking, no password sharing, no bot touching your inbox.",
              },
              {
                icon: ScanFace,
                title: "Get a read on them",
                body: "Vision AI works from what is actually in the photos and bio, then predicts how this person likes to be talked to.",
              },
              {
                icon: MessageSquareText,
                title: "Leave with something to send",
                body: "Openers written for that specific profile, plus a date plan built around real places near you and the weather that day.",
              },
            ].map(({ icon: Icon, title, body }, i, arr) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: EASE }}
                className="group relative grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 pb-12 last:pb-0 sm:grid-cols-[auto_1fr_1.1fr] sm:gap-x-10"
              >
                {/* Rule joining the steps. Communicates sequence, which three
                    detached rows did not. */}
                {i < arr.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[27px] top-16 bottom-2 w-px bg-gradient-to-b from-primary/40 to-primary/0"
                  />
                )}

                <motion.span
                  whileHover={{ scale: 1.08, rotate: -6 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                  className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-rose-500 shadow-[0_4px_14px_-2px_rgba(244,114,182,0.28),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.28)]"
                >
                  <Icon className="h-6 w-6 text-white" aria-hidden />
                </motion.span>

                <div className="flex flex-col gap-1.5 self-center">
                  <span className="font-mono text-xs tabular-nums text-primary/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                    {title}
                  </h3>
                </div>

                <p className="col-start-2 max-w-[46ch] text-sm leading-relaxed text-pretty text-muted-foreground sm:col-start-3 sm:self-center sm:text-base">
                  {body}
                </p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* ==================================================================
            FEATURES. Asymmetric bento, four items in four cells.
            ================================================================== */}
        <section
          id="features"
          className="section-defer border-t border-border/60 bg-card/10"
        >
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
            <motion.h2
              {...reveal}
              className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
            >
              It keeps going after the first message.
            </motion.h2>

            <div className="mt-14 grid gap-4 md:grid-cols-3">
              <motion.article
                {...reveal}
                {...lift}
                className="flex flex-col justify-between gap-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.16] via-pink-500/[0.08] to-transparent p-8 transition-colors hover:border-primary/40 md:col-span-2"
              >
                <div className="flex flex-col gap-3">
                  <h3 className="font-display text-2xl font-semibold text-foreground">
                    The Analyzer
                  </h3>
                  <p className="max-w-[52ch] text-sm leading-relaxed text-pretty text-muted-foreground">
                    Reads a profile, predicts a communication style, and writes
                    eight openers you can actually picture yourself sending.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Playful",
                    "Direct",
                    "Intellectual",
                    "Shy",
                    "Adventurous",
                  ].map((style) => (
                    <span
                      key={style}
                      className="rounded-full border border-primary/25 bg-background/70 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {style}
                    </span>
                  ))}
                </div>
              </motion.article>

              <motion.article
                {...reveal}
                {...lift}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-rose-500/[0.12] to-card p-8 transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-rose-500 shadow-[0_4px_14px_-2px_rgba(244,114,182,0.28),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.28)]"><Mic className="h-5 w-5 text-white" aria-hidden /></span>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Live coach
                </h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  A glasses style overlay that listens during the date and
                  offers a next question when the conversation stalls.
                </p>
              </motion.article>

              <motion.article
                {...reveal}
                {...lift}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-gradient-to-br from-pink-500/[0.12] to-card p-8 transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-rose-500 shadow-[0_4px_14px_-2px_rgba(244,114,182,0.28),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.28)]"><Trophy className="h-5 w-5 text-white" aria-hidden /></span>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Academy
                </h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  Missions that build one skill at a time, so the coaching turns
                  into something you keep after you close the app.
                </p>
              </motion.article>

              <motion.article
                {...reveal}
                {...lift}
                className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-gradient-to-br from-primary/[0.10] to-secondary/40 p-8 transition-colors hover:border-primary/40 md:col-span-2"
              >
                <div className="flex flex-col gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-rose-500 shadow-[0_4px_14px_-2px_rgba(244,114,182,0.28),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-1px_1px_rgba(0,0,0,0.28)]"><ShieldCheck className="h-5 w-5 text-white" aria-hidden /></span>
                  <h3 className="font-display text-xl font-semibold text-foreground">
                    Verified profiles
                  </h3>
                  <p className="max-w-[52ch] text-sm leading-relaxed text-pretty text-muted-foreground">
                    A selfie check matches the person in the photos to the
                    person behind the account, so the people you meet through
                    Crushie are who they say they are.
                  </p>
                </div>
              </motion.article>
            </div>
          </div>
        </section>

        {/* ==================================================================
            PRIVACY.

            IMPORTANT, do not add infrastructure claims here without changing
            the infrastructure first. The user-uploads bucket is currently
            public read with no auth condition (supabase/migrations/
            00003_storage_bucket.sql) and analyzer_sessions persists imageUrls
            alongside imageHash with no retention job. Every statement below is
            about product behaviour, which is true today. Claims such as "we
            delete your uploads" or "only hashes are stored" belong here only
            once that is actually the case.
            ================================================================== */}
        <section
          id="privacy"
          className="section-defer mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8"
        >
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <motion.div {...revealSlow} className="lg:col-span-5">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
                The part most AI dating tools skip.
              </h2>
              <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-pretty text-muted-foreground">
                You are handing over a conversation that matters to you. Here is
                exactly how much access that gives us.
              </p>

              <PrivacyPanel />
            </motion.div>

            <div className="flex flex-col lg:col-span-7">
              {[
                {
                  icon: KeyRound,
                  title: "We never ask for your dating app login",
                  body: "Crushie has no access to your accounts, your matches or your inbox. A screenshot is the only thing that ever reaches us.",
                },
                {
                  icon: PencilLine,
                  title: "Openers are drafts, not scripts",
                  body: "Nothing sends itself. Every suggestion lands in a box you edit first, because a message that is not yours will not survive the reply.",
                },
                {
                  icon: Eye,
                  title: "You decide what to upload",
                  body: "There is no background scanning and no always on listening. The coach runs when you start it and stops when you close it.",
                },
              ].map(({ icon: Icon, title, body }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.55, delay: i * 0.08, ease: EASE }}
                  className="flex gap-5 border-b border-border/60 py-6 first:pt-0 last:border-0 last:pb-0"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-rose-500/15">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-display font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================================================================
            CLOSING.
            ================================================================== */}
        <section className="section-defer border-t border-border/60 bg-card/15">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
            <ClosingMark />
            <motion.h2
              {...revealSlow}
              className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
            >
              You already know who you want to message.
            </motion.h2>
            <motion.p
              {...reveal}
              className="max-w-[44ch] text-lg leading-relaxed text-pretty text-muted-foreground"
            >
              Crushie helps with the next part.
            </motion.p>
            <motion.div {...reveal}>
              <StartFreeButton />
            </motion.div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
