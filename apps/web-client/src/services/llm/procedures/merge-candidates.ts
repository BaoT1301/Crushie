import type { ProfileSummary, VibeMatchEntry } from "../client";

export type MergedCandidate = VibeMatchEntry & {
  profile: ProfileSummary & { isDemo: boolean };
};

/**
 * Combine the model's ranking with every candidate it was given.
 *
 * The model decides how many matches to return and routinely returns fewer than
 * it was handed — 5 of 8 in testing, and not the same 5 between calls. Left
 * alone that silently hides real people from Discover, non-deterministically.
 *
 * Ranking is the model's job. Deciding who is allowed to exist is not. Anything
 * omitted is appended after the ranked results with no narrative, so the
 * ordering the model produced is preserved while nobody disappears. This is
 * also what makes the seeded demo personas reliably visible to every user
 * rather than appearing at the model's discretion.
 *
 * `isDemo` is derived from the `demo_` id prefix that migration 00011 assigns,
 * so there is no extra column to keep in sync. The UI uses it to label sample
 * profiles, which matters because they never reply.
 *
 * Extracted as a pure function so it can be tested without a model call.
 */
export function mergeCandidates(
  ranked: VibeMatchEntry[],
  allCandidates: ProfileSummary[],
): MergedCandidate[] {
  const rankedIds = new Set(
    ranked.map((entry) => entry.profile?.userId).filter(Boolean),
  );

  const unranked: VibeMatchEntry[] = allCandidates
    .filter((profile) => !rankedIds.has(profile.userId))
    .map((profile) => ({ profile, narrative: null }));

  return [...ranked, ...unranked]
    .filter((entry) => entry.profile?.userId)
    .map((entry) => ({
      ...entry,
      profile: {
        ...entry.profile,
        isDemo: entry.profile.userId.startsWith("demo_"),
      },
    }));
}
