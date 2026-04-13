# AstroBadger — Trusted Fusion Gateway

A zero-trust fusion middleware that verifies multi-source data before analytics. This reduces false data injection risk and improves decision confidence in distributed sensor systems.

## Overview

The **Trusted Fusion Gateway** is a prototype demonstrating:

- **Multi-source data fusion** — combining tracking and sensor events into unified fused events
- **Zero-trust validation** — distributed validator nodes verify event integrity before analytics
- **Pluggable proof backends** — trait-based validation supporting Merkle (SHA-256) and RSA accumulator backends
- **Sandboxed analytics** — containerized analytics engine processes only verified events
- **End-to-end visibility** — real-time dashboard shows every stage of the data pipeline

## Architecture

```
┌──────────────┐    ┌──────────────┐
│  Source A     │    │  Source B     │
│  (Tracking)   │    │  (Anomaly)    │
│  [Node.js]    │    │  [Node.js]    │
└──────┬───────┘    └──────┬───────┘
       │                   │
       └───────┬───────────┘
               ▼
       ┌───────────────┐
       │  Ingestion API │  ← Normalize, assign IDs
       │  Rust / Axum   │
       │   (port 3001)  │
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │ Fusion Service │  ← Match events by object_id
       │  Rust / Axum   │     within time window
       │   (port 3002)  │
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Validation    │  ← 3 validator nodes vote
       │  Rust / Axum   │     Merkle or RSA backend
       │   (port 3003)  │
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Analytics     │  ← Sandboxed, verified-only
       │  Rust / Axum   │     anomaly classification
       │   (port 3004)  │
       └───────────────┘
               ▼
       ┌───────────────┐
       │   Dashboard    │  ← Real-time pipeline view
       │  React / Node  │
       │   (port 3000)  │
       └───────────────┘
```

## Tech Stack

| Component | Language | Framework |
|-----------|----------|-----------|
| Ingestion API | **Rust** | Axum |
| Fusion Service | **Rust** | Axum |
| Validation Layer | **Rust** | Axum |
| Analytics Service | **Rust** | Axum |
| Shared Types | **Rust** | serde / sha2 |
| Data Source Simulators | Node.js | — |
| Dashboard Frontend | React 18 | Express (proxy) |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)

### Run the System

```bash
# Clone the repository
git clone https://github.com/ShaferWebbConsulting/AstroBadger.git
cd AstroBadger

# Start all services
docker compose up --build

# Open the dashboard
open http://localhost:3000
```

All six services start automatically:
| Service    | Port | Language | Description                        |
|------------|------|----------|------------------------------------|
| Frontend   | 3000 | Node/React | Dashboard UI                     |
| Ingestion  | 3001 | Rust/Axum  | Event normalization and intake   |
| Fusion     | 3002 | Rust/Axum  | Multi-source event correlation   |
| Validation | 3003 | Rust/Axum  | Distributed integrity verification |
| Analytics  | 3004 | Rust/Axum  | Sandboxed anomaly classification |
| Sources    | —    | Node.js    | Simulated satellite/sensor producers |

### Run Without Docker

```bash
# Build all Rust services
cargo build --release

# Start services (each in a separate terminal)
PORT=3001 FUSION_URL=http://localhost:3002/api/fuse ./target/release/tfg-ingestion
PORT=3002 VALIDATION_URL=http://localhost:3003/api/validate ./target/release/tfg-fusion
PORT=3003 ANALYTICS_URL=http://localhost:3004/api/analyze ./target/release/tfg-validation
PORT=3004 ./target/release/tfg-analytics

# Start the dashboard
cd frontend && npm install && npm start

# Start data sources (separate terminal)
cd services/sources && npm start
```

## Project Structure

```
├── Cargo.toml                  # Rust workspace root
├── Cargo.lock                  # Dependency lockfile
├── docker-compose.yml          # Orchestration for all services
├── shared/                     # Shared Rust crate (types + utils)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              # Crate root
│       ├── schemas.rs          # Event types, API models (serde)
│       └── utils.rs            # UUID, SHA-256 hashing, normalization
├── services/
│   ├── ingestion/              # Rust/Axum — Event intake
│   │   ├── Cargo.toml
│   │   ├── Dockerfile
│   │   └── src/main.rs
│   ├── fusion/                 # Rust/Axum — Event correlation
│   │   ├── Cargo.toml
│   │   ├── Dockerfile
│   │   └── src/main.rs
│   ├── validation/             # Rust/Axum — Integrity verification
│   │   ├── Cargo.toml
│   │   ├── Dockerfile
│   │   └── src/main.rs
│   ├── analytics/              # Rust/Axum — Anomaly classification
│   │   ├── Cargo.toml
│   │   ├── Dockerfile
│   │   └── src/main.rs
│   └── sources/                # Node.js — Data source simulators
│       ├── source-a.js         # Satellite tracking events
│       ├── source-b.js         # Sensor anomaly events
│       └── simulator.js        # Runs both sources
└── frontend/
    ├── server.js               # Express static server + API proxy
    └── public/index.html       # React dashboard
```

## Services Detail

### Data Sources (Node.js)

Two simulated producers emit JSON events:
- **Source A** (`satellite-alpha`): Tracking/position events with latitude, longitude, altitude, velocity
- **Source B** (`sensor-beta`): Anomaly/sensor events with infrared, radar, optical readings
- Both target the same pool of object IDs (OBJ-001 through OBJ-005) to enable fusion
- **Malicious simulation**: Every 10th event from Source B is marked as corrupted

### Ingestion API (Rust/Axum)

- Accepts events via `POST /api/events`
- Validates required fields (source_id, event_type, payload, object_id)
- Assigns unique event IDs and normalized timestamps
- Forwards to Fusion service
- Maintains audit log

### Fusion Service (Rust/Axum)

- Buffers incoming events by `object_id`
- When events from 2+ different sources arrive for the same object within a 10-second window, creates a fused event
- Calculates confidence score based on source diversity
- Corrupted payloads receive low confidence (0.1)
- Forwards fused events to Validation

### Validation Layer (Rust/Axum)

- Simulates 3 validator nodes (configurable via `NUM_VALIDATORS`)
- **Pluggable proof backend** via `ProofBackend` trait:
  - `MerkleProofBackend` (default) — SHA-256 hash verification
  - `RsaAccumulatorBackend` (placeholder) — structured for future RSA accumulator integration
  - Select via `PROOF_BACKEND` env var (`merkle` or `rsa`)
- Each validator independently:
  - Uses the proof backend to verify payload integrity
  - Checks confidence score > 0.3 threshold
  - Casts approve/reject vote
- Simple majority consensus: >50% approve = "verified"
- Tampered or low-confidence events are **rejected**

### Sandbox Analytics (Rust/Axum)

- **Only accepts verified events** (rejects non-verified with 403)
- Runs in a read-only Docker container with memory/CPU limits
- Performs anomaly classification: normal / elevated / critical
- Logs all inputs/outputs with cryptographic hashes (sandbox audit trail)

### Dashboard (React)

- Real-time pipeline visualization
- Shows: raw events, fused events, validation status, analytics output, audit logs
- Color-coded status badges and source indicators
- Auto-refreshes every 2 seconds
- Light and dark theme toggle

#### Dashboard Views

The dashboard offers two distinct views, toggled via the **Command View** / **Analyst View** buttons at the top of the page. Both views share the same live data stream, system status bar, fault injection controls, and data-flow health indicators. The difference is in how information is presented and what actions are available.

##### ⚡ Command View

The Command View is designed for **operators and decision-makers** who need real-time situational awareness at a glance. It is the default view when the dashboard loads.

![Command View Screenshot](https://github.com/user-attachments/assets/c08125cd-6676-49d0-bdc2-2bbdf239f2f3)

What you see in Command View:

| Panel | Description |
|-------|-------------|
| **🚨 Priority Events** | Full-width panel highlighting rejected, elevated, and critical events that need immediate attention |
| **🛰️ Source Health & Trust** | Multi-vendor source health, trust scores, and the ability to onboard new data sources on the fly |
| **● Fused Events (Enriched)** | Detailed table of every fused event with validation status, confidence, anomaly scores, and a drill-down modal for per-object investigation |
| **● Validation Status** | Event-by-event validation results with individual validator votes (approve/reject) and consensus outcome |
| **● Analytics Output** | Classification results (normal / elevated / critical), anomaly scores, and contributing factors for each event |
| **🧪 Analytics Tools / Sandbox** | Load and manage sandboxed analytics tools |
| **📋 Audit Log** | Chronological audit trail across all pipeline stages |
| **📡 Raw Events** | Unprocessed events as received from data sources |

All data panels in Command View include **CSV / JSON export** buttons for offline analysis.

##### 📊 Analyst View

The Analyst View is designed for **analysts and quality reviewers** who need aggregate metrics and statistical summaries rather than individual event details.

![Analyst View Screenshot](https://github.com/user-attachments/assets/8cb666ac-4f70-4489-972f-e6447fed3be1)

What you see in Analyst View:

| Section | Metrics |
|---------|---------|
| **📋 Validation Metrics** | Verified %, Rejected %, Pending %, and Consensus Success Rate — summarizing overall data integrity health |
| **🔗 Fusion Metrics** | Average Confidence score across all fused events, and Average Sources per Event — measuring fusion quality |
| **📊 Analytics Distribution** | Breakdown of classifications into Normal %, Elevated %, and Critical % — showing the threat/anomaly landscape |
| **● Validation Status** | Same per-event validation table as Command View for reference |
| **● Analytics Output** | Same per-event analytics table as Command View for reference |

All metrics in Analyst View are computed over the **last 60 seconds** of live data and update automatically.

##### When to Use Each View

| Scenario | Recommended View |
|----------|-----------------|
| Monitoring a live mission or exercise | ⚡ Command View |
| Investigating a specific rejected or elevated event | ⚡ Command View (use the drill-down modal) |
| Reviewing overall system health and data quality trends | 📊 Analyst View |
| Briefing leadership on pipeline performance | 📊 Analyst View |
| Testing fault injection (corrupted data, anomaly bursts) | ⚡ Command View |
| Exporting data for reports | ⚡ Command View (export buttons) |

## Testing

```bash
# Run all Rust tests
cargo test --workspace

# Run individual service tests
cargo test -p tfg-shared
cargo test -p tfg-ingestion
cargo test -p tfg-fusion
cargo test -p tfg-validation
cargo test -p tfg-analytics
```

## API Reference

### Ingestion (port 3001)
- `POST /api/events` — Submit a raw event
- `GET /api/events?limit=N` — List ingested events
- `GET /api/audit` — Ingestion audit logs
- `GET /api/health` — Health check

### Fusion (port 3002)
- `POST /api/fuse` — Submit event for fusion
- `GET /api/fused-events?limit=N` — List fused events
- `GET /api/audit` — Fusion audit logs
- `GET /api/health` — Health check

### Validation (port 3003)
- `POST /api/validate` — Submit fused event for validation
- `GET /api/validations?limit=N` — List validation results
- `GET /api/audit` — Validation audit logs
- `GET /api/health` — Health check

### Analytics (port 3004)
- `POST /api/analyze` — Submit verified event for analysis
- `GET /api/results?limit=N` — List analytics results
- `GET /api/audit` — Analytics audit logs
- `GET /api/health` — Health check

## Validation Backend Architecture

The validation layer uses a trait-based design for pluggable proof backends:

```rust
trait ProofBackend: Send + Sync {
    fn compute_proof(&self, payload: &serde_json::Value) -> String;
    fn verify(&self, payload: &serde_json::Value, declared_proof: &str) -> bool;
    fn name(&self) -> &str;
}
```

To add a new backend (e.g., RSA accumulator, zk-SNARK):
1. Implement the `ProofBackend` trait
2. Register it in the backend selection logic
3. Set `PROOF_BACKEND=your-backend` env var

## Security Features

- **Zero-trust validation**: Events must pass distributed consensus before analytics
- **Pluggable integrity verification**: Trait-based backends support Merkle (SHA-256) and future RSA accumulators
- **Sandbox isolation**: Analytics container runs read-only with resource limits
- **Malicious event rejection**: Corrupted/tampered events are automatically rejected
- **Full audit trail**: Every stage logs inputs, outputs, and decisions

## Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | All | 3001-3004 | Listen port |
| `FUSION_URL` | Ingestion | `http://fusion:3002/api/fuse` | Fusion service URL |
| `VALIDATION_URL` | Fusion | `http://validation:3003/api/validate` | Validation URL |
| `ANALYTICS_URL` | Validation | `http://analytics:3004/api/analyze` | Analytics URL |
| `TIME_WINDOW` | Fusion | `10000` | Fusion time window (ms) |
| `NUM_VALIDATORS` | Validation | `3` | Number of validator nodes |
| `PROOF_BACKEND` | Validation | `merkle` | Proof backend (`merkle` or `rsa`) |
| `INGESTION_URL` | Sources | `http://ingestion:3001/api/events` | Where sources send events |

## License

MIT
