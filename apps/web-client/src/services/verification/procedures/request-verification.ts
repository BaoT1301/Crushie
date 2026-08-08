import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users } from "@/services/users/schema";
import { verifications } from "../schema";
import { imageUrlToBase64, verifyIdentity } from "@/services/llm/client";

const requestVerificationInput = z.object({
  // Bounded to match the LLM service's own body limit. Unbounded, this layer
  // would buffer an arbitrarily large payload and forward it to a paid vision
  // call before anything downstream got the chance to reject it.
  selfieBase64: z
    .string()
    .min(1, "Selfie image data is required")
    .max(4_000_000, "Selfie image is too large"),
  selfieMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const requestVerification = authedProcedure
  .input(requestVerificationInput)
  .mutation(async ({ ctx, input }) => {
    let ephemeralSelfie = input.selfieBase64;

    try {
      const [currentUser] = await ctx.secureDb!.rls(async (tx) => {
        return tx
          .select({
            id: users.id,
            imageUrl: users.imageUrl,
          })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
      });

      if (!currentUser?.imageUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Upload a profile photo first before requesting verification.",
        });
      }

      const profilePhoto = await imageUrlToBase64(currentUser.imageUrl);

      const { data } = await verifyIdentity({
        profilePhoto,
        freshSelfie: {
          base64: ephemeralSelfie,
          mimeType: input.selfieMimeType,
        },
      });

      const verified = data.is_match && data.confidence > 0.85;
      const status: "verified" | "rejected" | "pending" = verified
        ? "verified"
        : data.confidence < 0.5
          ? "rejected"
          : "pending";

      await ctx.secureDb!.rls(async (tx) => {
        await tx.insert(verifications).values({
          userId: ctx.user.id,
          type: "selfie_liveness",
          status,
          metadata: {
            confidence: data.confidence,
            reasoning: data.reasoning,
            isMatch: data.is_match,
          },
          verifiedAt: status === "verified" ? new Date() : undefined,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });

        if (verified) {
          await tx
            .update(users)
            .set({
              isVerified: true,
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, ctx.user.id));
        }
      });

      const unsureMessage =
        status !== "verified" && data.confidence >= 0.5
          ? "The lighting might be too dark. Let's try again in a brighter spot!"
          : null;

      return {
        verified,
        confidence: data.confidence,
        reasoning: unsureMessage ?? data.reasoning,
        status,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to verify identity. Please try again.",
      });
    } finally {
      ephemeralSelfie = "";
    }
  });
