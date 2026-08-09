# ──────────────────────────────────────────────────────────────────────────
# Next.js web client.
#
# WHY A DOCKERFILE RATHER THAN NIXPACKS
#
# Nixpacks kept getting this wrong in ways that were slow to diagnose:
#
#   * it selected Node 18 despite .nvmrc and an engines field of ">=22",
#     and Next 16 requires >= 20.9
#   * it mounts a build cache inside node_modules, so `npm ci` failed with
#     EBUSY trying to remove a live mount
#   * with the service root directory set to apps/web-client it installed only
#     that package, which silently discards the root lockfile and with it the
#     ws / path-to-regexp / drizzle-orm security overrides
#
# The build context here MUST be the repository root, because this is an npm
# workspace: the lockfile and the overrides live there. Railway is pointed at
# this file through railway.json's dockerfilePath with the service root
# directory left at "/".
# ──────────────────────────────────────────────────────────────────────────

# ── Stage 1: install and build ────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /repo

# Whole context in one COPY, rather than manifests first.
#
# The manifest-first layout is the usual way to get a cacheable install layer,
# but it names each workspace package.json explicitly and a COPY whose source
# does not exist fails the build. That turned a wrong Root Directory setting
# into `"/apps/llm/package.json": not found`, which points at the wrong file and
# says nothing about the actual cause. One COPY cannot fail that way, and the
# error surfaces at `npm ci` instead, where a missing lockfile is self
# explanatory.
#
# The cost is that changing any source file invalidates the install layer.
# Railway builds on a fresh builder most of the time anyway, so the cache this
# gives up was largely theoretical.
COPY . .

# `npm ci` against the ROOT lockfile. This is the whole reason the build context
# must be the repository root: the lockfile carries the ws / path-to-regexp /
# drizzle-orm security overrides and the cross platform native binaries for
# lightningcss and @tailwindcss/oxide. Installing from apps/web-client alone
# resolves a fresh tree and silently drops all of it.
RUN npm ci

# Placeholders only. ClerkProvider needs a syntactically valid publishable key
# to prerender and the Supabase client needs a URL, but nothing is contacted at
# build time. Real values are injected as runtime environment variables, and
# NEXT_PUBLIC_* values that must be inlined are overridden by Railway at build.
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk
ARG NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=build_placeholder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build --workspace=@starter/web

# Drop dev dependencies before they are copied into the runtime image.
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /repo

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copied wholesale rather than cherry picking directories.
#
# npm workspaces hoist most packages to the repo root but not all of them, so
# whether apps/web-client/node_modules exists depends on the dependency graph.
# A COPY naming a path that does not exist fails the build, and that is a poor
# trade for a smaller image on a service this size. Dev dependencies are
# already gone via the prune above.
COPY --from=builder --chown=nextjs:nodejs /repo ./

USER nextjs

# Railway injects PORT. `next start` reads it, so it is not hardcoded here.
EXPOSE 3000

WORKDIR /repo/apps/web-client
CMD ["npx", "next", "start"]
