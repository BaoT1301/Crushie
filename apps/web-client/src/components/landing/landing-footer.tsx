import Link from "next/link";
import { HeartIcon } from "@/components/love-animations";
import { FooterLogo } from "@/components/landing/footer-logo";

/**
 * Landing footer.
 *
 * The rising hearts are deliberately preserved. They previously rendered as a
 * page-wide <FloatingHearts count={18}/> layer anchored to bottom:10%, which
 * meant 18 JS-driven motion.div loops running for the entire scroll just to
 * produce an effect that only reads at the bottom of the page. Here the same
 * idea is scoped to the footer, cut to 7 hearts, and driven by a CSS keyframe
 * on transform and opacity only, so it costs no main-thread work and stops
 * cleanly under prefers-reduced-motion.
 */

const hearts = [
  { left: "8%", delay: "0s", dur: "7s", drift: "14px", size: "h-3 w-3" },
  { left: "21%", delay: "1.6s", dur: "8.5s", drift: "-10px", size: "h-4 w-4" },
  { left: "35%", delay: "3.1s", dur: "6.5s", drift: "18px", size: "h-3 w-3" },
  { left: "52%", delay: "0.8s", dur: "9s", drift: "-16px", size: "h-5 w-5" },
  { left: "68%", delay: "2.4s", dur: "7.5s", drift: "12px", size: "h-3 w-3" },
  { left: "81%", delay: "4.2s", dur: "8s", drift: "-8px", size: "h-4 w-4" },
  { left: "93%", delay: "1.2s", dur: "6.8s", drift: "10px", size: "h-3 w-3" },
];

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border/60 bg-background">
      {/* Rising hearts. Decorative, so hidden from assistive tech. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
      >
        {hearts.map((heart) => (
          <span
            key={heart.left}
            className="heart-rise absolute bottom-8 text-primary/25"
            style={
              {
                left: heart.left,
                "--delay": heart.delay,
                "--dur": heart.dur,
                "--drift": heart.drift,
              } as React.CSSProperties
            }
          >
            <HeartIcon className={heart.size} />
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <FooterLogo />
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                Crushie
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A coach for the part of dating nobody teaches you: the first
              message, and the thirty seconds after it.
            </p>
          </div>

          {/* Links are 20px of text on a 12px gap, which is a 20px tap target.
              Each one is given min-h-11 and pulled back by -my-3 so it hits
              44px without changing the visual rhythm of the column. */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:gap-x-16">
            <div className="flex flex-col gap-3">
              <span className="font-display font-semibold text-foreground">
                Product
              </span>
              <a
                href="#how-it-works"
                className="-my-3 flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                How it works
              </a>
              <a
                href="#features"
                className="-my-3 flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                What you get
              </a>
              <a
                href="#privacy"
                className="-my-3 flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacy
              </a>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-display font-semibold text-foreground">
                Account
              </span>
              <Link
                href="/sign-in"
                className="-my-3 flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="-my-3 flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                Start free
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Built at PatriotHacks 2026 by Bao Tran, Lam Anh Truong, Mai Tran,
            and Nguyen Ho.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} Crushie</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
