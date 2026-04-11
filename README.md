# AstroBadger — Trusted Fusion Gateway

A zero-trust fusion middleware that verifies multi-source data before analytics. This reduces false data injection risk and improves decision confidence in distributed sensor systems.

## Overview

The **Trusted Fusion Gateway** is a prototype demonstrating:

- **Multi-source data fusion** — combining tracking and sensor events into unified fused events
- **Zero-trust validation** — distributed validator nodes verify event integrity before analytics
- **Sandboxed analytics** — containerized analytics engine processes only verified events
- **End-to-end visibility** — real-time dashboard shows every stage of the data pipeline

## Architecture

```
┌──────────────┐    ┌──────────────┐
│  Source A     │    │  Source B     │
│  (Tracking)   │    │  (Anomaly)    │
└──────┬───────┘    └──────┬───────┘
       │                   │
       └───────┬───────────┘
               ▼
       ┌───────────────┐
       │  Ingestion API │  ← Normalize, assign IDs
       │   (port 3001)  │
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │ Fusion Service │  ← Match events by object_id
       │   (port 3002)  │     within time window
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Validation    │  ← 3 validator nodes vote
       │   (port 3003)  │     hash + integrity check
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │  Analytics     │  ← Sandboxed, verified-only
       │   (port 3004)  │     anomaly classification
       └───────────────┘
               ▼
       ┌───────────────┐
       │   Dashboard    │  ← Real-time pipeline view
       │   (port 3000)  │
       └───────────────┘
```

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
| Service    | Port | Description                          |
|------------|------|--------------------------------------|
| Frontend   | 3000 | Dashboard UI                         |
| Ingestion  | 3001 | Event normalization and intake       |
| Fusion     | 3002 | Multi-source event correlation       |
| Validation | 3003 | Distributed integrity verification   |
| Analytics  | 3004 | Sandboxed anomaly classification     |
| Sources    | —    | Simulated satellite/sensor producers |

### Run Without Docker

```bash
# Install dependencies for each service
cd shared && cd ..
cd services/ingestion && npm install && cd ../..
cd services/fusion && npm install && cd ../..
cd services/validation && npm install && cd ../..
cd services/analytics && npm install && cd ../..
cd frontend && npm install && cd ..

# Start services (each in a separate terminal)
cd services/ingestion && npm start
cd services/fusion && npm start
cd services/validation && npm start
cd services/analytics && npm start
cd frontend && npm start

# Start data sources (separate terminal)
cd services/sources && npm start
```

## Project Structure

```
├── docker-compose.yml          # Orchestration for all services
├── shared/                     # Shared schemas, types, utilities
│   ├── schemas.js              # Event validation schemas
│   ├── utils.js                # UUID, hashing, normalization
│   └── index.js                # Barrel export
├── services/
│   ├── ingestion/              # Event intake and normalization
│   │   ├── server.js           # Express API (port 3001)
│   │   ├── logic.js            # Core ingestion logic
│   │   └── test.js             # Unit tests
│   ├── fusion/                 # Multi-source event correlation
│   │   ├── server.js           # Express API (port 3002)
│   │   ├── logic.js            # Fusion buffer + matching
│   │   └── test.js             # Unit tests
│   ├── validation/             # Distributed integrity verification
│   │   ├── server.js           # Express API (port 3003)
│   │   ├── logic.js            # Validator nodes + consensus
│   │   └── test.js             # Unit tests
│   ├── analytics/              # Sandboxed anomaly classification
│   │   ├── server.js           # Express API (port 3004)
│   │   ├── logic.js            # Scoring + classification
│   │   └── test.js             # Unit tests
│   └── sources/                # Data source simulators
│       ├── source-a.js         # Satellite tracking events
│       ├── source-b.js         # Sensor anomaly events
│       └── simulator.js        # Runs both sources
└── frontend/
    ├── server.js               # Static server + API proxy
    └── public/index.html       # React dashboard (CDN-loaded)
```

## Services Detail

### Data Sources

Two simulated producers emit JSON events:
- **Source A** (`satellite-alpha`): Tracking/position events with latitude, longitude, altitude, velocity
- **Source B** (`sensor-beta`): Anomaly/sensor events with infrared, radar, optical readings
- Both target the same pool of object IDs (OBJ-001 through OBJ-005) to enable fusion
- **Malicious simulation**: Every 10th event from Source B is marked as corrupted

### Ingestion API

- Accepts events via `POST /api/events`
- Validates required fields (source_id, event_type, payload, object_id)
- Assigns unique event IDs and normalized timestamps
- Forwards to Fusion service
- Maintains audit log

### Fusion Service

- Buffers incoming events by `object_id`
- When events from 2+ different sources arrive for the same object within a 10-second window, creates a fused event
- Calculates confidence score based on source diversity
- Corrupted payloads receive low confidence (0.1)
- Forwards fused events to Validation

### Validation Layer

- Simulates 3 validator nodes (configurable)
- Each validator independently:
  - Recomputes payload hash
  - Checks integrity against declared `payload_hash`
  - Verifies confidence score > 0.3 threshold
  - Casts approve/reject vote
- Simple majority consensus: >50% approve = "verified"
- Tampered or low-confidence events are **rejected**
- Structure supports future RSA accumulator integration

### Sandbox Analytics

- **Only accepts verified events** (rejects non-verified with 403)
- Runs in a read-only Docker container with memory/CPU limits
- Performs anomaly classification: normal / elevated / critical
- Logs all inputs/outputs with cryptographic hashes (sandbox audit trail)

### Dashboard

- Real-time pipeline visualization
- Shows: raw events, fused events, validation status, analytics output, audit logs
- Color-coded status badges and source indicators
- Auto-refreshes every 2 seconds

## Testing

```bash
# Run tests for each service
cd services/ingestion && npm test
cd services/fusion && npm test
cd services/validation && npm test
cd services/analytics && npm test
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

## Security Features

- **Zero-trust validation**: Events must pass distributed consensus before analytics
- **Integrity verification**: SHA-256 hash-based payload verification
- **Sandbox isolation**: Analytics container runs read-only with resource limits
- **Malicious event rejection**: Corrupted/tampered events are automatically rejected
- **Full audit trail**: Every stage logs inputs, outputs, and decisions

## License

MIT
