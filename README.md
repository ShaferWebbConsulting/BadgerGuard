# BADGER Guard — Runtime Assured Autonomy (RTAA) Platform

BADGER Guard is a collaborative autonomy runtime assurance MVP aligned to **DAF26BZ01-NV008 Runtime Assured Autonomy** language and architecture goals.

The platform evolves the original prototype into a mission-focused RTAA operations system for distributed autonomous fleets (ACP/CCA) operating in contested environments.

## Mission Focus

BADGER Guard demonstrates:

- runtime autonomy monitoring
- mission-level assurance
- collaborative fleet validation
- distributed autonomy fault detection
- autonomy-generated COA validation
- mitigation and recovery workflows
- contested/degraded communications simulation
- autonomous fleet coordination integrity monitoring

## Architecture

```text
Mission Autonomy Layer
  └─ Flight-Level Autonomy
      └─ Collaborative Autonomous Fleet (ACP / CCA)
          └─ COA Validation Engine
              └─ Runtime Assurance Layer
                  ├─ Mission Assurance Engine
                  ├─ Fleet Coordination Integrity Engine
                  └─ Mitigation & Recovery Manager
```

## Preserved Architectural Strengths

- distributed microservice architecture
- Rust backend services (Axum)
- React dashboard frontend
- Docker deployment
- real-time event processing
- distributed validation logic
- fault injection capabilities
- audit logging

## Services

| Service | Port | Purpose |
|---|---:|---|
| Frontend | 3000 | BADGER Guard RTAA operations dashboard |
| Ingestion | 3001 | Runtime telemetry intake and normalization |
| Fusion | 3002 | Mission-state correlation and COA event aggregation |
| Validation | 3003 | Distributed runtime validation and consensus |
| Analytics | 3004 | Runtime mission analysis on verified mission state |
| Sources | — | Autonomous fleet platform simulation |

## Simulated Autonomous Platforms

- ISR Drone
- Escort Drone
- Autonomous Strike Platform
- Logistics UAV
- Fleet Leader Node

## Simulated Mission Scenarios

- contested airspace
- degraded communications
- conflicting task allocation
- unsafe flight path generation
- mission replanning
- fleet coordination failures

## Runtime Mitigation Workflows

- reject unsafe COA
- constrained maneuver enforcement
- fleet task reallocation
- safe loiter mode
- return-to-base state
- degraded autonomy mode

## Dashboard Highlights

- Fleet Status
- Mission State
- Active COAs
- Runtime Safety Alerts
- Fleet Coordination Integrity
- Mission Assurance Score
- Runtime Fault Events
- Mitigation Actions
- Degraded Communications Status
- Platform Health
- Fleet Consensus / Coordination Status

## Mock Runtime Assurance Events

- unsafe route detected
- mission conflict identified
- deconfliction failure
- fleet synchronization degraded
- communications disruption
- mission reassignment triggered

## Quick Start

### Docker

```bash
docker compose up --build
# open http://localhost:3000
```

### Local

```bash
# Rust services
cargo build --release

# Example startup (separate terminals)
PORT=3001 FUSION_URL=http://localhost:3002/api/fuse ./target/release/tfg-ingestion
PORT=3002 VALIDATION_URL=http://localhost:3003/api/validate ./target/release/tfg-fusion
PORT=3003 ANALYTICS_URL=http://localhost:3004/api/analyze ./target/release/tfg-validation
PORT=3004 ./target/release/tfg-analytics

# Frontend
cd frontend && npm install && npm start

# Simulators
cd services/sources && npm start
```

## Testing

```bash
cargo test --workspace
```

## License

MIT
