/**
 * Environment tRPC Procedures — City search & geocoding
 *
 * Provides server-side city autocomplete and geocoding to avoid
 * exposing Google API keys to the client.
 */

import { authedProcedure, createTRPCRouter } from "@/server/init";
import { z } from "zod";
import { searchCities, geocodePlace } from "./geocoding";

/**
 * Both procedures below are authenticated, despite being "just autocomplete".
 *
 * They were publicProcedure, and src/proxy.ts exempts /api/trpc/* from
 * auth.protect() so that publicProcedure can exist at all. The combination
 * meant anyone on the internet could POST to these endpoints in a loop and
 * spend against GOOGLE_MAPS_API_KEY — Places Autocomplete and Geocoding are
 * both billed per request — with no account and no rate limit anywhere in the
 * Next.js app.
 *
 * The exposure is currently latent only because the key is unset in this
 * environment, so the calls short-circuit. It would open the day someone
 * configures billing, which is exactly the day nobody would be looking here.
 *
 * Requiring a session does not make this free, but it makes it attributable and
 * bounded by the sign-up flow. City search is only ever used from inside the
 * authenticated onboarding and analyzer flows, so nothing legitimate breaks.
 */
export const environmentRouter = createTRPCRouter({
  /** Search for cities by query string. */
  searchCities: authedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const suggestions = await searchCities(input.query);
      return { suggestions };
    }),

  /** Resolve a Google Place ID to lat/lng coordinates. */
  geocodeCity: authedProcedure
    .input(z.object({ placeId: z.string().min(1).max(512) }))
    .query(async ({ input }) => {
      const location = await geocodePlace(input.placeId);
      return { location };
    }),
});
