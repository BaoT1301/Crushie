/**
 * Upload Analyzer Image — tRPC procedures
 *
 * Handles uploading 1-10 images for the profile analyzer feature.
 * Images are stored in Supabase Storage under `{userId}/analyzer/`.
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logger } from "@/lib/logger";
import {
  uploadAnalyzerImage,
  getAnalyzerImageUrls,
  deleteAnalyzerImages,
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

export const uploadAnalyzerImageProcedure = authedProcedure
  .input(uploadInput)
  .mutation(async ({ ctx, input }): Promise<UploadResult> => {
    try {
      const buffer = Buffer.from(input.base64, "base64");

      // Validate size (base64 inflates ~33%, check decoded size)
      validateImageFile(input.mimeType, buffer.length);

      return await uploadAnalyzerImage(
        ctx.user.id,
        buffer,
        input.fileName,
        input.mimeType,
      );
    } catch (error) {
      logger.error("uploadAnalyzerImage failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to upload image",
      });
    }
  });

export const getAnalyzerImagesProcedure = authedProcedure.query(
  async ({ ctx }): Promise<UploadResult[]> => {
    try {
      return await getAnalyzerImageUrls(ctx.user.id);
    } catch (error) {
      logger.error("getAnalyzerImages failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to list analyzer images",
      });
    }
  },
);

export const deleteAnalyzerImagesProcedure = authedProcedure.mutation(
  async ({ ctx }): Promise<{ success: boolean }> => {
    try {
      await deleteAnalyzerImages(ctx.user.id);
      return { success: true };
    } catch (error) {
      logger.error("deleteAnalyzerImages failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete analyzer images",
      });
    }
  },
);
