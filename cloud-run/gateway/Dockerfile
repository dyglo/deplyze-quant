# ─── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL dependencies for build (including devDeps like tsc)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies after build to keep node_modules clean for the next stage
RUN npm prune --omit=dev --ignore-scripts

# ─── Stage 2: Runtime ──────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Production-only: copy compiled output + production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Cloud Run default port
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Required environment variables (set via Cloud Run --set-env-vars or Secret Manager):
#   FIREBASE_PROJECT_ID
#   GEMINI_API_KEY          (Secret Manager)
#   FINNHUB_API_KEY         (Secret Manager)
#   ALPHA_VANTAGE_API_KEY   (Secret Manager)
#   TWELVE_DATA_API_KEY     (Secret Manager)
#   TAVILY_API_KEY          (Secret Manager)
#   SERPER_API_KEY          (Secret Manager)
#   ALLOWED_ORIGINS         (comma-separated, optional)

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
