import type { MetadataRoute } from "next";

/**
 * Crawler rules.
 *
 * The landing page is the only thing worth indexing, and it is genuinely
 * server-rendered (a Suspense boundary in the theme provider used to bail the
 * whole tree to client rendering, which shipped an empty shell to crawlers).
 *
 * Everything else is behind auth. A crawler hitting those routes gets a redirect
 * to sign-in, which is harmless but wastes crawl budget and can surface
 * sign-in pages in results instead of the marketing page. `/api` is excluded for
 * the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/discover",
        "/profile",
        "/on-board",
        "/analyze-profile",
        "/settings",
        "/theme-editor",
        "/match/",
        "/vibe-matching",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
