import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema",
  // Schema introspection only. Do NOT run `drizzle-kit migrate` against this:
  // the canonical migrations live in the repo-root supabase/migrations and are
  // applied with `supabase db push`. The generated set here carries table DDL
  // only, with no RLS policies, no auth.user_id(), no pgvector and none of the
  // SQL functions the app calls, so applying it produces a wide-open database
  // where several routes crash on "function does not exist".
  out: "./drizzle/_generated_do_not_apply",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
