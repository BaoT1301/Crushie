import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks a seeded sample profile as what it is.
 *
 * The eight `demo_*` personas exist so Discover has something to show on a new
 * or quiet instance. They connect instantly and hold a real conversation, since
 * their replies are generated in character by the model.
 *
 * That is exactly why the label matters. A profile that answers you fluently is
 * far easier to mistake for a person than one that stays silent, and letting
 * someone believe they are talking to a real match is a deception with a real
 * cost to them. The badge is not optional chrome.
 *
 * Still true, and worth knowing: a two-person mission with a persona cannot
 * complete, because completion requires both participants to check in and a
 * persona never will.
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
      title="A sample profile, included so Discover has something to show. Its replies are AI generated, not a real person."
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Sample
    </span>
  );
}
