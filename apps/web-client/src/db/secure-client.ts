import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

type SecureDbOptions = {
  token?: string | null;
};

/**
 * Decode a compact JWT's payload segment into its claims object.
 *
 * This exists because of a real bug. Clerk's getToken() returns a compact JWT
 * ("header.payload.signature"), and the previous implementation passed that
 * string straight into:
 *
 *   select set_config('request.jwt.claims', <raw jwt>, true)
 *
 * But auth.user_id() (supabase/migrations/00001_initial_schema.sql) reads it as
 *
 *   current_setting('request.jwt.claims', true)::json->>'sub'
 *
 * and a compact JWT is not JSON, so that cast raises 22P02 invalid input syntax
 * for type json. set_config itself does not validate, so the failure surfaced on
 * the next query inside the transaction rather than at the point of the mistake,
 * which is why it was easy to misdiagnose. Two files in src/legacy exist purely
 * to work around the symptom (one mocks a user id, one runs
 * ALTER TABLE ... DISABLE ROW LEVEL SECURITY "to bypass JWT issues").
 *
 * Passing the decoded payload makes auth.user_id() resolve correctly, which is
 * what every RLS policy in 00002 depends on.
 *
 * Note this decodes without verifying the signature, which is correct here: the
 * token came from Clerk's own server-side auth() in this same process, so it is
 * already trusted. Never use this on a token received from a client.
 */
function decodeJwtClaims(token: string): string {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new Error("Malformed Clerk token: expected three JWT segments");
  }

  const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(
    payload.length + ((4 - (payload.length % 4)) % 4),
    "=",
  );

  const decoded = Buffer.from(padded, "base64").toString("utf8");

  // Round-trip so a malformed payload fails here, loudly, rather than as an
  // opaque Postgres cast error several queries later.
  JSON.parse(decoded);

  return decoded;
}

/**
 * Get a database connection that runs queries under Supabase RLS, scoped to the
 * calling Clerk user.
 */
export async function getSecureDb(options: SecureDbOptions = {}) {
  const token =
    options.token ?? (await (await auth()).getToken({ template: "supabase" }));

  if (!token) {
    throw new Error("Unauthorized: No Clerk Supabase token found");
  }

  const claims = decodeJwtClaims(token);

  type DbTransaction = Parameters<typeof db.transaction>[0] extends (
    tx: infer T,
  ) => Promise<unknown>
    ? T
    : never;

  return {
    rls: async <T>(
      queryCallback: (tx: DbTransaction) => Promise<T>,
    ): Promise<T> => {
      return await db.transaction(async (tx) => {
        // local=true scopes the setting to this transaction, so it clears on
        // both COMMIT and ROLLBACK and cannot leak into a pooled connection.
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${claims}, true)`,
        );

        return await queryCallback(tx);
      });
    },
  };
}
