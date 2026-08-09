/**
 * Supabase Admin Client, server side only.
 *
 * Uses the service-role key to bypass RLS for storage and for the few
 * operations that are legitimately cross user (retention, sample persona
 * replies). Auth is handled by Clerk; this client is for trusted server work.
 *
 * NEVER expose this client to the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Constructed on first use, not at module load.
 *
 * The eager version threw during import when the keys were absent, and any
 * route that imports this transitively is evaluated by `next build` when it
 * collects page data. So a missing key did not degrade one feature: it failed
 * the entire production build, on a machine that has no reason to hold
 * production secrets. CI hit exactly that.
 *
 * This is the same failure the Clerk webhook had with `new Resend(...)`, and it
 * is worth stating the rule once: a module-scope throw turns runtime
 * configuration into a build-time dependency.
 *
 * Deferring it keeps the build hermetic while still failing loudly the first
 * time something actually tries to use the client, with a message that names
 * the missing variables.
 */
let client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }

  client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}

/**
 * Service-role Supabase client. Full access to Storage, bypasses RLS.
 *
 * A Proxy so every existing `supabaseAdmin.from(...)` and
 * `supabaseAdmin.storage` call site keeps working unchanged while construction
 * stays lazy.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(getSupabaseAdmin(), property, receiver);
  },
});

/** Bucket name for user-uploaded content */
export const USER_UPLOADS_BUCKET = "user-uploads";
