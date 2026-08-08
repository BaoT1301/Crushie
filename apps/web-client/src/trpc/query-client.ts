import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

/**
 * Do not retry a request the server has already judged.
 *
 * React Query retries three times by default, which is right for a flaky
 * network and wrong for a considered "no". Several queries here cost a paid
 * model call — `llm.vibeMatch` sends every candidate profile to OpenAI — so a
 * failure that retries by default bills four completions instead of one.
 *
 * 4xx means the request itself is the problem: UNAUTHORIZED, NOT_FOUND, and the
 * PRECONDITION_FAILED thrown when a user has no vibe profile yet. Repeating any
 * of those produces the same answer at the same price. 5xx and network faults
 * still get one retry, because those genuinely are transient.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;

  if (typeof status === "number" && status >= 400 && status < 500) {
    return false;
  }

  return failureCount < 1;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: shouldRetry,

        /**
         * Off deliberately.
         *
         * The default refetches every stale query whenever the tab regains
         * focus. On a page whose queries are LLM calls, alt-tabbing back after
         * 30 seconds silently spends money — and the user sees no difference,
         * because the answer is near enough identical. Freshness that matters
         * here arrives through Supabase Realtime (chat) or explicit
         * invalidation after a mutation, neither of which depends on this.
         */
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
