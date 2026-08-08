import type { Context } from "hono";
import { getSecureDb } from "@/db/secure-client";
import type { AuthEnv } from "./middleware";

/**
 * Run a query under Row Level Security, as the caller of this request.
 *
 * WHY EVERY ROUTE NEEDS THIS
 *
 * These routes used to import the raw `db` client from `@/db`. That was
 * harmless while DATABASE_URL connected as Supabase's `postgres` role, because
 * that role has BYPASSRLS and every policy was skipped. Migration 00009 moved
 * the app onto `crushie_app`, which is NOBYPASSRLS, and the raw client sets no
 * `request.jwt.claims` — so `public.user_id()` returns NULL and every policy
 * evaluates against a caller who is nobody.
 *
 * The failure is asymmetric and easy to misread:
 *
 *   SELECT  → zero rows, no error. Endpoints return `[]` or `null` and look
 *             merely empty rather than broken.
 *   UPDATE  → zero rows affected, no error. Handlers that return `{success:
 *             true}` without checking rowCount report success for a write that
 *             did not happen.
 *   DELETE  → same as UPDATE.
 *   INSERT  → 42501, a real error, and the only one of the four that is loud.
 *
 * Wrapping the query here sets the claims for the transaction, so policies see
 * the actual user.
 *
 * The transaction is the RLS boundary: `set_config(..., local => true)` is
 * scoped to it and clears on both COMMIT and ROLLBACK, so nothing leaks into
 * the next borrower of a pooled connection. That means multi-statement work
 * belongs inside ONE call — two calls are two transactions with no atomicity
 * between them.
 */
export async function withRls<T>(
  c: Context<AuthEnv>,
  query: (
    tx: Parameters<Awaited<ReturnType<typeof getSecureDb>>["rls"]>[0] extends (
      tx: infer Tx,
    ) => Promise<unknown>
      ? Tx
      : never,
  ) => Promise<T>,
): Promise<T> {
  const secure = await getSecureDb({ token: c.var.clerkToken });
  return secure.rls(query);
}
