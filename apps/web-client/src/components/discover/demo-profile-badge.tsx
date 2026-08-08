import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks a seeded sample profile as what it is.
 *
 * The eight `demo_*` personas exist so Discover has something to show on a new
 * or quiet instance. They are matchable and browsable, but they are not people:
 * they will never reply to a message, and a two-person mission with one can
 * never complete, because completion requires both participants to check in.
 *
 * Rendering them indistinguishably from real users would leave someone waiting
 * for a reply that cannot arrive. That is a small deception with a real cost to
 * the person on the other side of it, so the label is not optional chrome.
 *
 * The flag comes from `profile.isDemo`, set server-side in
 * services/llm/procedures/vibe-match.ts from the id prefix.
 */
export function DemoProfileBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary",
        className,
      )}
      title="A sample profile, included so Discover has something to show. It will not reply to messages."
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Sample
    </span>
  );
}
