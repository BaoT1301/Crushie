"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeartIcon } from "@/components/love-animations";

/**
 * Marketing navigation.
 *
 * The app <Navbar/> renders seven authenticated destinations (Dashboard,
 * Analyzer, Match Center, Onboard, Vibe Profiles, Theme Editor, Settings).
 * Every one of them bounces a signed-out visitor to /sign-in, so on the public
 * landing page they are dead links wearing navigation clothing. This nav is
 * scoped to what a visitor can actually act on: three in-page anchors and one
 * sign-in. Signed-in visitors get a direct route back into the product.
 *
 * Height is 64px, inside the 80px cap, and the desktop row never wraps.
 */

const sections = [
  { label: "How it works", href: "#how-it-works" },
  { label: "What you get", href: "#features" },
  { label: "Privacy", href: "#privacy" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  // Scroll progress. Driven by useScroll rather than a scroll listener, and
  // smoothed so it glides instead of stepping. This is the only motion on the
  // page that is continuous rather than a one-shot reveal, which is what gives
  // the long middle of a single-page site a sense of forward movement.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="absolute inset-x-0 top-0 h-0.5 origin-left bg-gradient-to-r from-primary via-pink-500 to-rose-500"
      />
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          /* Negative margin plus matching padding lifts the 32px mark to a
             48x48 tap target, leaving the 64px row height unchanged. */
          className="-mx-2 -my-2 flex shrink-0 items-center gap-2.5 rounded-full p-2 transition-opacity hover:opacity-80"
        >
          {/* rounded-[9px], not rounded-xl: --radius-xl is 16px, which on a
              32px box is exactly half the width and renders a circle. 9px
              matches the hero mark's corner-to-size ratio. */}
          <motion.span
            whileHover={{ scale: 1.1, rotate: -8 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 320, damping: 15 }}
            className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white shadow-sm"
          >
            <HeartIcon className="h-4 w-4 text-background" />
          </motion.span>
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            Crushie
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-full px-3.5 py-2 text-sm text-white/70 transition-colors hover:text-white"
            >
              {section.label}
            </a>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SignedOut>
            <SignInButton mode="modal">
              <Button size="sm" className="rounded-full px-5">
                Sign in
              </Button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Button size="sm" asChild className="rounded-full px-5">
              <Link href="/dashboard">Open Crushie</Link>
            </Button>
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </SignedIn>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="max-h-[calc(100dvh-4rem)] overflow-x-hidden overflow-y-auto overscroll-contain border-t border-border/60 bg-background md:hidden"
          >
            {/* Height cap + internal scroll so the sheet can never run past the
                bottom of a short/landscape viewport, and safe-area padding so
                the last link clears the iOS home indicator. */}
            <div className="flex flex-col gap-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
