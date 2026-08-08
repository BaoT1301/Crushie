/**
 * Upload Onboard Image — tRPC procedure
 *
 * Accepts a base64-encoded image (for web clients where multipart
 * isn't as natural as REST). For mobile, prefer the Hono multipart endpoint.
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logger } from "@/lib/logger";
import {
  uploadOnboardImage,
  getOnboardImageUrls,
  deleteOnboardImages,
  validateImageFile,
  type UploadResult,
} from "@/services/uploads/storage";

// ── Input schemas ───────────────────────────────────────────────────────

const uploadInput = z.object({
  /** Base64-encoded image data (without data URI prefix) */
  base64: z.string().min(1, "Image data is required"),
  /** Original file name */
  fileName: z.string().min(1).max(255),
  /** MIME type */
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
});

// ── Procedures ──────────────────────────────────────────────────────────

export const uploadOnboardImageProcedure = authedProcedure
  .input(uploadInput)
  .mutation(async ({ ctx, input }): Promise<UploadResult> => {
    try {
      const buffer = Buffer.from(input.base64, "base64");

      // Validate size (base64 inflates ~33%, check decoded size)
      validateImageFile(input.mimeType, buffer.length);

      return await uploadOnboardImage(
        ctx.user.id,
        buffer,
        input.fileName,
        input.mimeType,
      );
    } catch (error) {
      logger.error("uploadOnboardImage failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to upload image",
      });
    }
  });

export const getOnboardImagesProcedure = authedProcedure.query(
  async ({ ctx }): Promise<UploadResult[]> => {
    try {
      return await getOnboardImageUrls(ctx.user.id);
    } catch (error) {
      logger.error("getOnboardImages failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to list onboard images",
      });
    }
  },
);

export const deleteOnboardImagesProcedure = authedProcedure.mutation(
  async ({ ctx }): Promise<{ success: boolean }> => {
    try {
      await deleteOnboardImages(ctx.user.id);
      return { success: true };
    } catch (error) {
      logger.error("deleteOnboardImages failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete onboard images",
      });
    }
  },
);
