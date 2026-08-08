/**
 * Ambient background.
 *
 * Extracted from a block that was copy-pasted across on-board, analyze-profile
 * and analyze-profile/[id]. Each copy rendered three blurred orbs tinted
 * --primary, --chart-3 and --color-gold, every one of them on `animate-pulse`.
 *
 * Two problems with that. Gold and chart-3 are separate accents, so the app
 * carried three competing hues against a single-accent brand. And
 * `animate-pulse` animates opacity on an infinite loop with no reduced-motion
 * escape, which is the WCAG 2.2.2 gap the landing page rework closed.
 *
 * This uses the same `.ambient-drift` keyframe as the landing page, which is
 * transform-only, compositor-friendly and already gated behind
 * prefers-reduced-motion in globals.css.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="ambient-drift absolute -top-32 -left-24 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-[110px]" />
      <div
        className="ambient-drift absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-primary/[0.07] blur-[120px]"
        style={{ animationDelay: "-14s" }}
      />
    </div>
  );
}
