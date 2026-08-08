import { clerkSetup } from "@clerk/testing/playwright";
import { config } from "dotenv";
import path from "node:path";

/**
 * Loads the app's real Clerk keys and fetches the Frontend API URL that
 * setupClerkTestingToken needs to bypass bot protection.
 */
export default async function globalSetup() {
  config({ path: path.resolve(__dirname, "../apps/web-client/.env") });

  process.env.CLERK_PUBLISHABLE_KEY ||=
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  await clerkSetup();
}
