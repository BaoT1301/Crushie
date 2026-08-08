/**
 * Uploads — Mobile REST routes
 *
 * Handles multipart file uploads to Supabase Storage.
 * Files are scoped under `{userId}/on-board/` for onboarding images.
 *
 * Endpoints:
 *   POST   /uploads/onboard-image    — Upload a single onboarding image
 *   GET    /uploads/onboard-images   — List all onboarding images
 *   DELETE /uploads/onboard-images   — Delete all onboarding images
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthEnv } from "../middleware";
import { logger } from "@/lib/logger";
import {
  uploadOnboardImage,
  getOnboardImageUrls,
  deleteOnboardImages,
  validateImageFile,
  UploadError,
} from "@/services/uploads/storage";

const app = new Hono<AuthEnv>();

// ── POST /uploads/onboard-image ─────────────────────────────────────────
// Accepts multipart/form-data with a single `image` field.
app.post("/onboard-image", async (c) => {
  const userId = c.var.userId;

  try {
    const contentType = c.req.header("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: `Expected multipart/form-data, got: ${contentType || "(none)"}`,
      });
    }

    const formData = await c.req.formData();
    const raw = formData.get("image");

    if (!raw) {
      const keys: string[] = [];
      formData.forEach((_, k) => keys.push(k));
      logger.error("[uploads] 'image' not found. Available keys", keys);
      throw new HTTPException(400, {
        message: "Missing 'image' field in form data",
      });
    }

    if (typeof raw === "string") {
      // The multipart part had no `filename` in Content-Disposition,
      // so the FormData parser treated the binary payload as a text
      // string. This usually means the client didn't send the
      // filename — see mobile `useUploadOnboardImage` for the fix.
      logger.error(
        "[uploads] 'image' was parsed as text, not a File — the client must send FormData with a filename",
        undefined,
        { valueLength: raw.length },
      );
      throw new HTTPException(400, {
        message:
          "Image was received as text. " +
          "Ensure the client sends the file with a filename in FormData.",
      });
    }

    const file = raw as File;

    // Validate file type and size
    validateImageFile(file.type, file.size);

    // Convert File/Blob to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadOnboardImage(
      userId,
      buffer,
      file.name || `photo-${Date.now()}.jpg`,
      file.type,
    );

    return c.json({ data: result }, 201);
  } catch (error) {
    if (error instanceof UploadError) {
      throw new HTTPException(error.statusCode as 400 | 500, {
        message: error.message,
      });
    }
    throw error;
  }
});

// ── GET /uploads/onboard-images ─────────────────────────────────────────
app.get("/onboard-images", async (c) => {
  const userId = c.var.userId;

  try {
    const images = await getOnboardImageUrls(userId);
    return c.json({ data: images });
  } catch (error) {
    if (error instanceof UploadError) {
      throw new HTTPException(error.statusCode as 400 | 500, {
        message: error.message,
      });
    }
    throw error;
  }
});

// ── DELETE /uploads/onboard-images ──────────────────────────────────────
app.delete("/onboard-images", async (c) => {
  const userId = c.var.userId;

  try {
    await deleteOnboardImages(userId);
    return c.json({ message: "All onboarding images deleted" });
  } catch (error) {
    if (error instanceof UploadError) {
      throw new HTTPException(error.statusCode as 400 | 500, {
        message: error.message,
      });
    }
    throw error;
  }
});

export default app;
