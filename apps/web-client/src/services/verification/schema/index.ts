import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  pgEnum,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@/services/users/schema";

// ============================================================================
// Enums
// ============================================================================
export const verificationTypeEnum = pgEnum("verification_type", [
  "selfie_liveness",
  "photo_match",
  "phone",
  "social_vouch",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
  "expired",
]);

export const analyzerStyleEnum = pgEnum("analyzer_style", [
  "direct",
  "playful",
  "intellectual",
  "shy",
  "adventurous",
]);

// ============================================================================
// Verifications & Liveness
// ============================================================================
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: verificationTypeEnum("type").notNull(),
    status: verificationStatusEnum("status").notNull().default("pending"),
    proofHash: text("proof_hash"),
    metadata: jsonb("metadata").default({}),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // NOTE: there is deliberately no last_verified_at here. This model used to
    // declare one, but the column exists only on `users` (added in 00004), never
    // on this table, so every insert failed with `column "last_verified_at" of
    // relation "verifications" does not exist` — after the paid vision call had
    // already been made. On a per-attempt row, verified_at already carries the
    // same information; "last" is a property of the user, not of one attempt.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_verifications_user").on(table.userId),
    index("idx_verifications_status").on(table.status),
  ],
);

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

// ============================================================================
// Analyzer Sessions (screenshot analysis — ephemeral)
// ============================================================================
export const analyzerSessions = pgTable(
  "analyzer_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Input metadata (image is NOT stored — only hash)
    imageHash: text("image_hash").notNull(),
    hintTags: text("hint_tags")
      .array()
      .default(sql`'{}'`),
    // AI output
    predictedStyle: analyzerStyleEnum("predicted_style"),
    vibePrediction: jsonb("vibe_prediction").default({}),
    conversationOpeners: text("conversation_openers")
      .array()
      .default(sql`'{}'`),
    dateSuggestions: jsonb("date_suggestions").default([]),
    // Environmental context (privacy: city only, no raw coords)
    city: text("city"),
    weatherContext: jsonb("weather_context"),
    locationContext: jsonb("location_context"),
    nearbyPlaces: jsonb("nearby_places").default([]),
    // Metadata
    modelVersion: text("model_version"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_analyzer_sessions_user").on(table.userId)],
);

export type AnalyzerSession = typeof analyzerSessions.$inferSelect;
export type NewAnalyzerSession = typeof analyzerSessions.$inferInsert;
