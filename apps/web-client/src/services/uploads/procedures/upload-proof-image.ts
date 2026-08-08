/**
 * Upload Proof Image — tRPC procedure
 *
 * Accepts a base64-encoded image for mission check-in proof.
 */

import { authedProcedure } from "@/server/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logger } from "@/lib/logger";
import {
  uploadProofImage,
  validateImageFile,
  type UploadResult,
} from "@/services/uploads/storage";

const uploadInput = z.object({
  base64: z.string().min(1, "Image data is required"),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
});

export const uploadProofImageProcedure = authedProcedure
  .input(uploadInput)
  .mutation(async ({ ctx, input }): Promise<UploadResult> => {
    try {
      const buffer = Buffer.from(input.base64, "base64");
      validateImageFile(input.mimeType, buffer.length);

      return await uploadProofImage(
        ctx.user.id,
        buffer,
        input.fileName,
        input.mimeType,
      );
    } catch (error) {
      logger.error("uploadProofImage failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to upload image",
      });
    }
  });
