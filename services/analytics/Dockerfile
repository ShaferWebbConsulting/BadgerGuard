# ── Sandbox Analytics Service ────────────────────────────────────
# Security constraints (enforced at orchestration layer):
#   - Read-only filesystem (--read-only flag in Docker/K8s)
#   - No network egress in production (network policy / --network=none)
#   - No host mounts or privileged capabilities
#   - Memory and CPU limits enforced via cgroup constraints

# ── Build stage ──────────────────────────────────────────────────
FROM rust:1.86-alpine AS builder
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY shared/ shared/
COPY services/ingestion/ services/ingestion/
COPY services/fusion/ services/fusion/
COPY services/validation/ services/validation/
COPY services/analytics/ services/analytics/

RUN cargo build --release -p tfg-analytics

# ── Runtime stage ────────────────────────────────────────────────
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /build/target/release/tfg-analytics /usr/local/bin/tfg-analytics
EXPOSE 3004
CMD ["tfg-analytics"]
