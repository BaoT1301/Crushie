/**
 * Redis Cache Layer (optional)
 *
 * Caches LLM responses to avoid redundant API calls for identical prompts.
 * Gracefully degrades — if Redis is unavailable, the service works without caching.
 */

import Redis from "ioredis";
import crypto from "crypto";
import { logger } from "./logger.js";

let redis: Redis | null = null;
let isConnected = false;

const DEFAULT_TTL = parseInt(process.env.REDIS_CACHE_TTL || "3600", 10);

/**
 * Initialize Redis connection. Non-blocking — failures are logged, not thrown.
 */
export function initRedis(): void {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("ℹ️  REDIS_URL not set — caching disabled");
    return;
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on("connect", () => {
      isConnected = true;
      console.log("✅ Redis connected — caching enabled");
    });

    redis.on("error", (err) => {
      isConnected = false;
      logger.warn("Redis error (caching disabled)", { detail: err.message });
    });

    redis.on("close", () => {
      isConnected = false;
    });

    redis.connect().catch(() => {
      logger.warn("Could not connect to Redis — caching disabled");
    });
  } catch {
    logger.warn("Redis init failed — caching disabled");
  }
}

/**
 * Generate a deterministic cache key from a prompt string.
 */
function cacheKey(prompt: string): string {
  const hash = crypto.createHash("sha256").update(prompt).digest("hex");
  return `llm:prompt:${hash}`;
}

/**
 * Get a cached response for a prompt.
 */
export async function getCachedResponse(
  prompt: string,
): Promise<string | null> {
  if (!redis || !isConnected) return null;

  try {
    return await redis.get(cacheKey(prompt));
  } catch {
    return null;
  }
}

/**
 * Cache a response for a prompt.
 */
export async function setCachedResponse(
  prompt: string,
  response: string,
  ttl: number = DEFAULT_TTL,
): Promise<void> {
  if (!redis || !isConnected) return;

  try {
    await redis.setex(cacheKey(prompt), ttl, response);
  } catch {
    // Non-critical — just skip caching
  }
}

/**
 * Check if Redis is available.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Gracefully close Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
    isConnected = false;
  }
}
