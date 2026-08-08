import { authedProcedure, createTRPCRouter, publicProcedure } from "../init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { usersRouter } from "@/services/users/procedures";
import { examplesRouter } from "@/services/examples/procedures";
import { vibeProfilesRouter } from "@/services/vibe-profiles/procedures";
import { socialRouter } from "@/services/social/procedures";
import { missionsRouter } from "@/services/missions/procedures";
import { verificationRouter } from "@/services/verification/procedures";
import { llmRouter } from "@/services/llm/procedures";
import { uploadsRouter } from "@/services/uploads/procedures";
import { environmentRouter } from "@/services/environment/procedures";
import { realtimeRouter } from "@/services/realtime/procedures";
import { chatRouter } from "@/services/chat/procedures";
import { academyRouter } from "@/services/academy/procedures";
import { logger } from "@/lib/logger";

export const appRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      try {
        return {
          greeting: `Hello ${input.text}!`,
        };
      } catch (error) {
        logger.error("Error in hello procedure", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),

  // Protected health check
  protectedHello: authedProcedure.query(({ ctx }) => {
    try {
      return {
        greeting: `Hello ${ctx.user.firstName ?? "User"}!`,
        userId: ctx.user.id,
      };
    } catch (error) {
      logger.error("Error in protectedHello procedure", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }),

  // Service routers
  users: usersRouter,
  examples: examplesRouter,
  vibeProfiles: vibeProfilesRouter,
  social: socialRouter,
  missions: missionsRouter,
  verification: verificationRouter,
  llm: llmRouter,
  realtime: realtimeRouter,
  uploads: uploadsRouter,
  environment: environmentRouter,
  chat: chatRouter,
  academy: academyRouter,
});

export type AppRouter = typeof appRouter;
