import "dotenv/config";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/services/llm/client";
import {
  buildProfileText,
  toVectorLiteral,
  type EmbeddableProfile,
} from "@/services/vibe-profiles/embedding";

/**
 * Fill in missing vibe-profile embeddings.
 *
 *   npm run db:backfill-embeddings --workspace=@starter/web
 *
 * WHY THIS EXISTS
 *
 * Two reasons, one historical and one ongoing.
 *
 * Historical: nothing in the app ever wrote `vibe_profiles.embedding`, so every
 * profile created before that was fixed has a NULL vector and is invisible to
 * matching. The seeded demo personas had synthetic sin()-based vectors, which
 * are worse than NULL in a subtle way — they are internally consistent (any two
 * personas score ~0.90 against each other) but share no space with real
 * OpenAI embeddings, so a real user scores ~0 against all of them. Re-embedding
 * them from their own persona text puts everyone in the same vector space.
 *
 * Ongoing: embedAndStoreProfile is deliberately fail-soft, so a transient
 * OpenAI error leaves a profile saved but unembedded rather than losing the
 * user's onboarding. This is the repair path for that. `db:preflight` reports
 * the count so it cannot pile up unnoticed.
 *
 * Uses the service-role client on purpose: it bypasses RLS, which is required
 * to write rows belonging to other users (the demo personas).
 *
 * Idempotent. Pass --force to re-embed every profile rather than only the ones
 * missing a vector (needed if buildProfileText ever changes, since vectors are
 * only comparable to others built the same way).
 */

type ProfileRow = {
  user_id: string;
  vibe_name: string;
  vibe_summary: string | null;
  energy: string | null;
  mood_tags: string[] | null;
  style_tags: string[] | null;
  interest_tags: string[] | null;
  embedding: string | null;
};

const FORCE = process.argv.includes("--force");

async function main() {
  const { data, error } = await supabaseAdmin
    .from("vibe_profiles")
    .select(
      "user_id, vibe_name, vibe_summary, energy, mood_tags, style_tags, interest_tags, embedding",
    )
    .eq("is_active", true);

  if (error) throw new Error(`Could not read vibe_profiles: ${error.message}`);

  const rows = (data ?? []) as ProfileRow[];
  const targets = FORCE ? rows : rows.filter((r) => r.embedding === null);

  console.log(`active profiles:      ${rows.length}`);
  console.log(`missing an embedding: ${rows.filter((r) => r.embedding === null).length}`);
  console.log(`will embed:           ${targets.length}${FORCE ? " (--force)" : ""}\n`);

  if (!targets.length) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const row of targets) {
    const profile: EmbeddableProfile = {
      vibeName: row.vibe_name,
      vibeSummary: row.vibe_summary,
      energy: row.energy,
      moodTags: row.mood_tags,
      styleTags: row.style_tags,
      interestTags: row.interest_tags,
    };

    try {
      const { data: emb } = await generateEmbedding(buildProfileText(profile));

      const { error: updateError } = await supabaseAdmin
        .from("vibe_profiles")
        .update({ embedding: toVectorLiteral(emb.embedding) })
        .eq("user_id", row.user_id)
        .eq("is_active", true);

      if (updateError) throw new Error(updateError.message);

      ok++;
      console.log(`  ok    ${row.user_id.padEnd(34)} ${row.vibe_name}`);
    } catch (err) {
      failed++;
      console.log(
        `  FAIL  ${row.user_id.padEnd(34)} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`\nembedded ${ok}, failed ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("backfill failed:", err?.message ?? err);
  process.exit(1);
});
