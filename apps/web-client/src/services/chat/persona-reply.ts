import { supabaseAdmin } from "@/lib/supabase";
import { generatePersonaReply } from "@/services/llm/client";
import { logger } from "@/lib/logger";

/**
 * Make the seeded sample profiles answer when someone messages them.
 *
 * WHY THE SERVICE-ROLE CLIENT
 *
 * The insert policy on direct_messages is
 * `WITH CHECK (sender_id = public.user_id() AND <caller is in the match>)`,
 * which is exactly right for real users and makes it impossible for the app to
 * write a message *as* someone else. A persona reply is the one legitimate case
 * where the server needs to do that, so it goes through the service-role
 * client — the same deliberate exception retention uses.
 *
 * The scope is narrow on purpose: this only ever writes as an id starting with
 * `demo_`, checked below. It cannot be used to post as a real user.
 *
 * WHY IT IS AWAITED
 *
 * Fire-and-forget after the response would be lost on a serverless host, where
 * work after the response is not guaranteed to run. The user's own message is
 * inserted first and separately, so a slow or failed reply never costs them
 * their message — worst case the persona stays quiet, which is the behaviour
 * that existed before this.
 */

/** Recent turns handed to the model for continuity. */
const HISTORY_LIMIT = 10;

export function isDemoUser(userId: string): boolean {
  return userId.startsWith("demo_");
}

/**
 * Which participant is the sample persona, if either.
 *
 * Returns null for real-to-real matches, which is the overwhelmingly common
 * case and must be untouched by any of this.
 */
export function demoParticipant(
  userAId: string,
  userBId: string,
): string | null {
  if (isDemoUser(userAId)) return userAId;
  if (isDemoUser(userBId)) return userBId;
  return null;
}

export async function replyAsPersonaIfDemoMatch(params: {
  matchId: string;
  userAId: string;
  userBId: string;
}): Promise<void> {
  const personaId = demoParticipant(params.userAId, params.userBId);
  if (!personaId) return;

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("vibe_profiles")
      .select("vibe_name, vibe_summary, energy, mood_tags, interest_tags")
      .eq("user_id", personaId)
      .eq("is_active", true)
      .single();

    if (profileError || !profile) {
      logger.warn("No active vibe profile for sample persona; staying silent", {
        personaId,
      });
      return;
    }

    const { data: recent, error: historyError } = await supabaseAdmin
      .from("direct_messages")
      .select("sender_id, content")
      .eq("match_id", params.matchId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (historyError) {
      logger.warn("Could not read chat history for a sample persona reply", {
        matchId: params.matchId,
      });
      return;
    }

    // Query is newest-first for the LIMIT; the model wants oldest-first.
    const history = (recent ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        role: m.sender_id === personaId ? ("persona" as const) : ("user" as const),
        content: m.content,
      }));

    const { data } = await generatePersonaReply({
      persona: {
        vibeName: profile.vibe_name,
        vibeSummary: profile.vibe_summary ?? undefined,
        energy: profile.energy ?? undefined,
        moodTags: profile.mood_tags ?? undefined,
        interestTags: profile.interest_tags ?? undefined,
      },
      history,
    });

    const reply = data.reply?.trim();
    if (!reply) return;

    const { error: insertError } = await supabaseAdmin
      .from("direct_messages")
      .insert({
        match_id: params.matchId,
        sender_id: personaId,
        content: reply.slice(0, 2000),
      });

    if (insertError) {
      logger.error("Failed to store a sample persona reply", insertError, {
        matchId: params.matchId,
        personaId,
      });
    }
  } catch (error) {
    // Never let this break sending. The user's message is already committed.
    logger.error("Sample persona reply failed", error, {
      matchId: params.matchId,
      personaId,
    });
  }
}
