/**
 * Upload Service — Supabase Storage operations
 *
 * Handles file uploads to the `user-uploads` bucket,
 * scoped under `{userId}/on-board/` for onboarding images.
 */

import { supabaseAdmin, USER_UPLOADS_BUCKET } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ── Constants ───────────────────────────────────────────────────────────

const ONBOARD_PREFIX = "on-board";
const ANALYZER_PREFIX = "analyzer";
const PROOF_PREFIX = "proof";
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Types ───────────────────────────────────────────────────────────────

export type UploadResult = {
  url: string;
  path: string;
};

export class UploadError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

// ── Signed URLs ─────────────────────────────────────────────────────────

/**
 * How long a generated read URL stays valid.
 *
 * The bucket is private, so reads go through short-lived signed URLs instead
 * of permanent public ones. Seven days is long enough that a page rendered and
 * left open keeps working, short enough that a leaked link expires.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Sign a stored object path for reading.
 *
 * Accepts either a bare storage path ("{userId}/on-board/abc.jpg") or a legacy
 * absolute URL. Rows written before the bucket was locked down persisted
 * absolute public URLs, so the absolute form is detected and its path
 * extracted rather than breaking every existing profile photo.
 */
export async function getSignedUrl(
  pathOrUrl: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const path = toStoragePath(pathOrUrl);

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new UploadError(
      500,
      `Failed to sign storage object: ${error?.message ?? "unknown error"}`,
    );
  }

  return data.signedUrl;
}

/** Sign many paths at once, preserving order. */
export async function getSignedUrls(
  pathsOrUrls: string[],
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string[]> {
  return Promise.all(pathsOrUrls.map((p) => getSignedUrl(p, expiresIn)));
}

/**
 * Normalise a stored value to a bucket-relative path.
 *
 * Legacy rows hold "https://<project>.supabase.co/storage/v1/object/public/
 * user-uploads/<path>", so everything after the bucket segment is the path.
 */
export function toStoragePath(pathOrUrl: string): string {
  if (!pathOrUrl.startsWith("http")) return pathOrUrl;

  const marker = `/${USER_UPLOADS_BUCKET}/`;
  const idx = pathOrUrl.indexOf(marker);
  if (idx === -1) return pathOrUrl;

  return decodeURIComponent(pathOrUrl.slice(idx + marker.length).split("?")[0]);
}

// ── Validation ──────────────────────────────────────────────────────────

export function validateImageFile(mimeType: string, size: number): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new UploadError(
      400,
      `Invalid file type: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
    );
  }
  if (size > MAX_FILE_SIZE) {
    throw new UploadError(
      400,
      `File too large: ${(size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`,
    );
  }
}

// ── Upload ──────────────────────────────────────────────────────────────

/**
 * Upload a single onboarding image for a user.
 *
 * Storage path: `{userId}/on-board/{timestamp}-{fileName}`
 */
export async function uploadOnboardImage(
  userId: string,
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  // Sanitize filename — remove special chars, keep extension
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `${userId}/${ONBOARD_PREFIX}/${timestamp}-${safeName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    logger.error("[upload] Supabase storage error", error);
    throw new UploadError(500, `Upload failed: ${error.message}`);
  }

  // Get public URL
  const signedUrl = await getSignedUrl(data.path);

  return {
    url: signedUrl,
    path: data.path,
  };
}

// ── List ────────────────────────────────────────────────────────────────

/**
 * List all onboarding image URLs for a user.
 */
export async function getOnboardImageUrls(
  userId: string,
): Promise<UploadResult[]> {
  const prefix = `${userId}/${ONBOARD_PREFIX}`;

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .list(prefix, {
      sortBy: { column: "created_at", order: "asc" },
    });

  if (error) {
    logger.error("[upload] List error", error);
    throw new UploadError(500, `Failed to list images: ${error.message}`);
  }

  // Signing is async, so the map has to be awaited as a batch.
  return Promise.all(
    (data ?? []).map(async (file) => {
      const path = `${prefix}/${file.name}`;
      return { url: await getSignedUrl(path), path };
    }),
  );
}

// ── Delete ──────────────────────────────────────────────────────────────

/**
 * Delete all onboarding images for a user.
 */
export async function deleteOnboardImages(userId: string): Promise<void> {
  const prefix = `${userId}/${ONBOARD_PREFIX}`;

  // List files first
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .list(prefix);

  if (listError) {
    logger.error("[upload] List error for deletion", listError);
    throw new UploadError(
      500,
      `Failed to list images for deletion: ${listError.message}`,
    );
  }

  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${prefix}/${f.name}`);

  const { error: deleteError } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .remove(paths);

  if (deleteError) {
    logger.error("[upload] Delete error", deleteError);
    throw new UploadError(
      500,
      `Failed to delete images: ${deleteError.message}`,
    );
  }
}

// ── Analyzer Image Uploads ──────────────────────────────────────────────

/**
 * Upload a single analyzer image for a user.
 *
 * Storage path: `{userId}/analyzer/{timestamp}-{fileName}`
 */
export async function uploadAnalyzerImage(
  userId: string,
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `${userId}/${ANALYZER_PREFIX}/${timestamp}-${safeName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    logger.error("[upload] Supabase storage error (analyzer)", error);
    throw new UploadError(500, `Upload failed: ${error.message}`);
  }

  const signedUrl = await getSignedUrl(data.path);

  return {
    url: signedUrl,
    path: data.path,
  };
}

/**
 * List all analyzer image URLs for a user.
 */
export async function getAnalyzerImageUrls(
  userId: string,
): Promise<UploadResult[]> {
  const prefix = `${userId}/${ANALYZER_PREFIX}`;

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .list(prefix, {
      sortBy: { column: "created_at", order: "asc" },
    });

  if (error) {
    logger.error("[upload] List error (analyzer)", error);
    throw new UploadError(500, `Failed to list images: ${error.message}`);
  }

  // Signing is async, so the map has to be awaited as a batch.
  return Promise.all(
    (data ?? []).map(async (file) => {
      const path = `${prefix}/${file.name}`;
      return { url: await getSignedUrl(path), path };
    }),
  );
}

/**
 * Delete all analyzer images for a user.
 */
export async function deleteAnalyzerImages(userId: string): Promise<void> {
  const prefix = `${userId}/${ANALYZER_PREFIX}`;

  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .list(prefix);

  if (listError) {
    logger.error("[upload] List error for deletion (analyzer)", listError);
    throw new UploadError(
      500,
      `Failed to list images for deletion: ${listError.message}`,
    );
  }

  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${prefix}/${f.name}`);

  const { error: deleteError } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .remove(paths);

  if (deleteError) {
    logger.error("[upload] Delete error (analyzer)", deleteError);
    throw new UploadError(
      500,
      `Failed to delete analyzer images: ${deleteError.message}`,
    );
  }
}

// ── Proof Upload ────────────────────────────────────────────────────────

/**
 * Upload a mission proof image for a user.
 *
 * Storage path: `{userId}/proof/{timestamp}-{fileName}`
 */
export async function uploadProofImage(
  userId: string,
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `${userId}/${PROOF_PREFIX}/${timestamp}-${safeName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(USER_UPLOADS_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    logger.error("[upload] Supabase storage error (proof)", error);
    throw new UploadError(500, `Upload failed: ${error.message}`);
  }

  const signedUrl = await getSignedUrl(data.path);

  return {
    url: signedUrl,
    path: data.path,
  };
}
