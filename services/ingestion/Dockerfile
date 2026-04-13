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

RUN cargo build --release -p tfg-ingestion

# ── Runtime stage ────────────────────────────────────────────────
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /build/target/release/tfg-ingestion /usr/local/bin/tfg-ingestion
EXPOSE 3001
CMD ["tfg-ingestion"]
