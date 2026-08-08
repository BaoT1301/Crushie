import type { MetadataRoute } from "next";

/**
 * Sitemap.
 *
 * Deliberately tiny: only the routes a signed-out visitor can actually reach.
 * Listing authenticated routes would advertise URLs that answer every crawler
 * with a redirect, which is worse than not listing them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const lastModified = new Date();

  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/sign-up`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/sign-in`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
