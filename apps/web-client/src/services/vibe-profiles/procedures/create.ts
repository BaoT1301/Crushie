import { authedProcedure } from "@/server/init";
import { vibeProfiles } from "../schema";
import { eq } from "drizzle-orm";
import { createVibeProfileInput } from "./validation";
import { embedAndStoreProfile } from "../embedding";

export const create = authedProcedure
  .input(createVibeProfileInput)
  .mutation(async ({ ctx, input }) => {
    await ctx.secureDb!.rls(async (tx) => {
      await tx
        .update(vibeProfiles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(vibeProfiles.userId, ctx.user.id));
    });

    const [created] = await ctx.secureDb!.rls(async (tx) => {
      const rows = await tx
        .insert(vibeProfiles)
        .values({
          userId: ctx.user.id,
          vibeName: input.vibeName,
          vibeSummary: input.vibeSummary,
          energy: input.energy,
          moodTags: input.moodTags,
          styleTags: input.styleTags,
          interestTags: input.interestTags,
          quizAnswers: input.quizAnswers,
          photoUrls: input.photoUrls,
        })
        .onConflictDoUpdate({
          target: vibeProfiles.userId,
          set: {
            vibeName: input.vibeName,
            vibeSummary: input.vibeSummary,
            energy: input.energy,
            moodTags: input.moodTags,
            styleTags: input.styleTags,
            interestTags: input.interestTags,
            quizAnswers: input.quizAnswers,
            photoUrls: input.photoUrls,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Same transaction as the insert: a profile with no vector never appears
      // in matching, so the two are one operation.
      await embedAndStoreProfile(tx, ctx.user.id, {
        vibeName: input.vibeName,
        vibeSummary: input.vibeSummary,
        energy: input.energy,
        moodTags: input.moodTags,
        styleTags: input.styleTags,
        interestTags: input.interestTags,
      });

      return rows;
    });

    return created;
  });
