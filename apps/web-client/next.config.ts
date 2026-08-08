import path from "node:path";
import type { NextConfig } from "next";

/**
 * Content-Security-Policy, in report-only mode.
 *
 * Shipped as Report-Only rather than enforcing on purpose. This app loads
 * third-party script and connects to several origins (Clerk, Supabase including
 * its realtime websocket, Google Places/Static Maps), and an enforcing policy
 * that is even slightly wrong takes down sign-in or image loading with an error
 * that looks nothing like a CSP problem. Report-Only surfaces every violation
 * in the console and via report-uri without breaking anything, so the list
 * below can be corrected against real traffic first.
 *
 * To enforce: watch the console on sign-in, onboarding and the analyzer, fix
 * whatever is reported, then rename the header to `Content-Security-Policy`.
 *
 * 'unsafe-inline' and 'unsafe-eval' in script-src are what Next's inline
 * bootstrap and Clerk currently require. Tightening those needs nonce-based
 * CSP, which is a separate piece of work.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.googleapis.com https://*.gstatic.com https://*.clerk.com https://img.clerk.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co wss://*.supabase.co https://*.googleapis.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Two years, subdomains included, preload-eligible. Safe here because the app
  // is HTTPS-only in production; it is not sent in dev (see the guard below).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Clickjacking. The app has no legitimate embedder, and CSP frame-ancestors
  // above says the same thing for browsers that prefer it.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops the browser from re-interpreting a user upload as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URLs here can contain match and analyzer session ids, so send the
  // origin only once the request leaves our site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app genuinely uses camera (selfie verification, glasses simulator) and
  // geolocation (date suggestions), so those stay enabled for same-origin and
  // everything else is denied outright.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // Advertising the framework and version tells an attacker which CVE list to
  // work from and buys us nothing.
  poweredByHeader: false,

  // Pin the workspace root to the repo root. Without this, Next walks up
  // looking for a lockfile and lands on the parent Downloads folder (which
  // has a stray package-lock.json), causing Turbopack to file-watch that
  // entire directory instead of just this project.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.gstatic.com",
        port: "",
        pathname: "/**",
      },
      // The hosts images are actually served from. next/image is not in use
      // yet, so these are inert today — they are here so that adopting it does
      // not immediately 400 on every avatar and analyzer upload.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    // HSTS over plain http is meaningless and, worse, a browser that caches it
    // from localhost will refuse to load http://localhost later.
    const headers =
      process.env.NODE_ENV === "production"
        ? securityHeaders
        : securityHeaders.filter(
            (header) => header.key !== "Strict-Transport-Security",
          );

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
