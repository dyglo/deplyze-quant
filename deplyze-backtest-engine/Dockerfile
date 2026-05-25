# ─── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.86-slim AS builder

WORKDIR /app

# System deps for ring/object_store TLS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Cache dependency compilation: copy manifests, build a stub, then real sources.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release || true
RUN rm -rf src

COPY src ./src
RUN touch src/main.rs && cargo build --release

# ─── Runtime stage ──────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/deplyze-backtest-engine /usr/local/bin/deplyze-backtest-engine

ENV PORT=8080
EXPOSE 8080

# Run as non-root.
RUN useradd --system --uid 10001 appuser
USER appuser

ENTRYPOINT ["/usr/local/bin/deplyze-backtest-engine"]
