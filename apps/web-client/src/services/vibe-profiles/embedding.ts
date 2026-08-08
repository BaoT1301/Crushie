import { logger } from "@/lib/logger";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "@/services/llm/client";

/**
 * Writing the vector that makes matching work.
 *
 * `vibe_profiles.embedding` has existed since migration 00002 and every
 * similarity query depends on it, but nothing in the codebase ever wrote it:
 * all four insert paths omitted the column, and it is absent from the Drizzle
 * model by design (Drizzle has no native pgvector type). The candidate query in
 * find-and-evaluate-matches requires the *caller's* embedding to be non-NULL,
 * so it short-circuited for every real user and Discover reported "no
 * compatible profiles found" no matter how many profiles existed.
 *
 * This module is the one place that fills that gap.
 */

/** The fields a vibe profile contributes to its own embedding. */
export type EmbeddableProfile = {
  vibeName: string;
  vibeSummary?: string | null;
  energy?: string | null;
  moodTags?: string[] | null;
  styleTags?: string[] | null;
  interestTags?: string[] | null;
};

/**
 * Flatten a profile into the text that gets embedded.
 *
 * Labelled and ordered rather than a bare concatenation: the model weights
 * position, and consistent structure is what makes two profiles comparable.
 * Any change here invalidates every stored vector, because vectors are only
 * meaningful relative to others produced the same way — change it and you must
 * re-embed everyone, including the demo personas seeded in 00015.
 */
export function buildProfileText(profile: EmbeddableProfile): string {
  const lines = [
    `Vibe: ${profile.vibeName}`,
    profile.vibeSummary ? `About: ${profile.vibeSummary}` : null,
    profile.energy ? `Energy: ${profile.energy}` : null,
    profile.moodTags?.length ? `Mood: ${profile.moodTags.join(", ")}` : null,
    profile.styleTags?.length ? `Style: ${profile.styleTags.join(", ")}` : null,
    profile.interestTags?.length
      ? `Interests: ${profile.interestTags.join(", ")}`
      : null,
  ];

  return lines.filter(Boolean).join("\n");
}

/** pgvector's text input format: `[0.1,-0.2,...]`. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

type Tx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * Generate and store the embedding for a user's active vibe profile.
 *
 * Deliberately fail-soft. Onboarding calls this immediately after a successful
 * profile generation, so the user has already waited through one model call and
 * an image upload; throwing away that work because a second, cheap call
 * hiccuped is the worse trade. A profile without an embedding is still a valid
 * profile — it is just invisible to matching until re-embedded.
 *
 * Because that failure is silent by design, `npm run db:preflight` counts
 * profiles missing an embedding so the condition cannot accumulate unnoticed.
 *
 * Returns whether the embedding was written, so callers can surface it if they
 * want to.
 */
export async function embedAndStoreProfile(
  tx: Tx,
  userId: string,
  profile: EmbeddableProfile,
): Promise<boolean> {
  try {
    const text = buildProfileText(profile);
    const { data } = await generateEmbedding(text);
    const literal = toVectorLiteral(data.embedding);

    await tx.execute(sql`
      UPDATE vibe_profiles
      SET embedding = ${literal}::vector, updated_at = NOW()
      WHERE user_id = ${userId} AND is_active = TRUE
    `);

    return true;
  } catch (error) {
    logger.error(
      "Failed to embed vibe profile; it is saved but will not appear in matching until re-embedded",
      error,
      { userId },
    );
    return false;
  }
}
