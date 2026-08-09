# ──────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy build context (works for both root-context and apps/llm-context builds)
COPY . .

# Install dependencies and build from detected app directory
RUN set -eux; \
  APP_DIR="."; \
  if [ -f apps/llm/package.json ]; then APP_DIR="apps/llm"; fi; \
  cd "$APP_DIR"; \
  npm install; \
  npm run build; \
  mkdir -p /opt/llm; \
  cp package.json /opt/llm/package.json; \
  cp -r dist /opt/llm/dist

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: Production
# ──────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package files and install production deps only
COPY --from=builder /opt/llm/package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built output from builder
COPY --from=builder /opt/llm/dist ./dist

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Health check.
#
# Reads PORT rather than hardcoding 3001: hosts that inject their own port
# (Railway, Fly, Cloud Run) would otherwise probe a port nothing is listening
# on, and the container would be restarted forever while the app was healthy.
# src/index.ts uses the same `PORT || 3001` fallback.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3001}/api/health" || exit 1

# Start
CMD ["node", "dist/index.js"]
