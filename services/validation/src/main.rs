use std::env;
use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{HeaderValue, Method},
    routing::{get, post},
    Json, Router,
};
use rand::Rng;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

use tfg_shared::{
    make_audit, generate_id, hash_json, now_iso,
    AuditLog, ErrorResponse, FusedEvent, HealthResponse, ValidationResult, ValidatorVote,
};

// ─── Proof Backend Trait ────────────────────────────────────────────────────
//
// The `ProofBackend` trait abstracts the integrity-proof mechanism used during
// event validation.  Every backend must be `Send + Sync` so it can live inside
// `Arc<dyn ProofBackend>` and be shared across async tasks.
//
// ### Adding a new backend
//
// 1. Create a struct that implements `ProofBackend`.
// 2. Wire it into `select_proof_backend()` (match on a new env-var value).
// 3. The rest of the validation pipeline is backend-agnostic — no other
//    changes are required.
// ────────────────────────────────────────────────────────────────────────────

/// Pluggable proof backend used by the validation layer.
///
/// Implementations compute and verify integrity proofs over event payloads.
/// The trait is object-safe so it can be stored as `Arc<dyn ProofBackend>`.
trait ProofBackend: Send + Sync {
    /// Compute the integrity proof (hash / accumulator) for an event's JSON
    /// payload.  The returned string is treated as an opaque proof token by the
    /// rest of the system.
    fn compute_proof(&self, payload: &serde_json::Value) -> String;

    /// Verify that `declared_proof` matches the proof computed from `payload`.
    fn verify(&self, payload: &serde_json::Value, declared_proof: &str) -> bool;

    /// Human-readable name of this backend (e.g. "merkle-sha256").
    fn name(&self) -> &str;
}

// ─── Merkle / SHA-256 Backend (default) ─────────────────────────────────────

/// Default proof backend.
///
/// Uses the same deterministic SHA-256 hash produced by `hash_json` from the
/// shared crate.  This gives us Merkle-tree-style content addressing: changing
/// a single byte in the payload changes the hash.
struct MerkleProofBackend;

impl ProofBackend for MerkleProofBackend {
    fn compute_proof(&self, payload: &serde_json::Value) -> String {
        hash_json(payload)
    }

    fn verify(&self, payload: &serde_json::Value, declared_proof: &str) -> bool {
        self.compute_proof(payload) == declared_proof
    }

    fn name(&self) -> &str {
        "merkle-sha256"
    }
}

// ─── RSA Accumulator Backend (placeholder) ──────────────────────────────────
//
// An RSA accumulator allows constant-size proofs of set membership.  The
// intended workflow is:
//
//   1. Maintain a running accumulator value `A` (a large integer mod N).
//   2. For each event payload, derive a prime representative `p` from its hash.
//   3. Update the accumulator: `A' = A^p mod N`.
//   4. A membership witness for element `p_i` is `w = A'^(1/p_i) mod N`.
//
// The current implementation falls back to SHA-256 so the service compiles and
// passes tests.  Swap in a real RSA accumulator library (e.g. `accumulator`)
// when ready.
// ────────────────────────────────────────────────────────────────────────────

/// Placeholder RSA-accumulator backend.
///
/// TODO: replace SHA-256 fallback with real RSA accumulator operations:
///   - `compute_proof`: derive prime representative, update accumulator, return
///     witness.
///   - `verify`: check witness against the current accumulator value.
struct RsaAccumulatorBackend;

impl ProofBackend for RsaAccumulatorBackend {
    fn compute_proof(&self, payload: &serde_json::Value) -> String {
        // Placeholder: fall back to SHA-256 until a real RSA accumulator
        // library is integrated.
        let canonical = serde_json::to_string(payload).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(canonical.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn verify(&self, payload: &serde_json::Value, declared_proof: &str) -> bool {
        // Placeholder: recompute and compare (same as Merkle for now).
        self.compute_proof(payload) == declared_proof
    }

    fn name(&self) -> &str {
        "rsa-accumulator"
    }
}

// ─── Backend Selection ──────────────────────────────────────────────────────

/// Read `PROOF_BACKEND` env var and return the matching implementation.
fn select_proof_backend() -> Arc<dyn ProofBackend> {
    match env::var("PROOF_BACKEND").unwrap_or_default().as_str() {
        "rsa" => {
            info!("Using RSA accumulator proof backend (placeholder)");
            Arc::new(RsaAccumulatorBackend)
        }
        _ => {
            info!("Using Merkle/SHA-256 proof backend");
            Arc::new(MerkleProofBackend)
        }
    }
}

// ─── Validator Node ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct Validator {
    validator_id: String,
    /// Hex-encoded signing key — used by future proof backends for witness generation.
    key: String,
}

fn create_validators(count: usize) -> Vec<Validator> {
    (0..count)
        .map(|_| {
            let id = generate_id();
            let mut key_bytes = [0u8; 32];
            rand::thread_rng().fill(&mut key_bytes);
            let key = key_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>();
            Validator {
                validator_id: id,
                key,
            }
        })
        .collect()
}

// ─── Application State ─────────────────────────────────────────────────────

struct AppState {
    results: Vec<ValidationResult>,
    audit_log: Vec<AuditLog>,
    validators: Vec<Validator>,
    proof_backend: Arc<dyn ProofBackend>,
}

type SharedState = Arc<RwLock<AppState>>;

const MAX_RESULTS: usize = 1000;
const MAX_AUDIT: usize = 1000;

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "validation".into(),
    })
}

#[derive(Deserialize)]
struct LimitQuery {
    limit: Option<usize>,
}

async fn get_validations(
    State(state): State<SharedState>,
    Query(q): Query<LimitQuery>,
) -> Json<Vec<ValidationResult>> {
    let st = state.read().await;
    let limit = q.limit.unwrap_or(st.results.len());
    let mut out: Vec<ValidationResult> = st.results.iter().rev().take(limit).cloned().collect();
    // Already reversed by iter().rev(); keep most-recent-first order.
    let _ = &mut out;
    Json(out)
}

async fn get_audit(State(state): State<SharedState>) -> Json<Vec<AuditLog>> {
    let st = state.read().await;
    Json(st.audit_log.clone())
}

async fn validate_event(
    State(state): State<SharedState>,
    Json(event): Json<FusedEvent>,
) -> Result<Json<ValidationResult>, Json<ErrorResponse>> {
    // Snapshot validators and proof backend while holding the read lock briefly.
    let (validators, backend) = {
        let st = state.read().await;
        (st.validators.clone(), Arc::clone(&st.proof_backend))
    };

    info!(
        event_id = %event.event_id,
        backend = backend.name(),
        "Validating event"
    );

    // ── Parallel simulated consensus ────────────────────────────────────
    let mut vote_handles = Vec::new();

    for v in &validators {
        let payload = event.raw_payloads.clone();
        let declared_hash = event.payload_hash.clone();
        let confidence = event.confidence_score;
        let vid = v.validator_id.clone();
        let backend = Arc::clone(&backend);

        vote_handles.push(tokio::spawn(async move {
            // Simulate network / computation delay (10-100 ms).
            let delay_ms = rand::thread_rng().gen_range(10..=100);
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;

            let computed_hash = backend.compute_proof(&payload);
            let hash_ok = backend.verify(&payload, &declared_hash);
            let confidence_ok = confidence > 0.3;

            let vote = if hash_ok && confidence_ok {
                "approve"
            } else {
                "reject"
            };

            ValidatorVote {
                validator_id: vid,
                vote: vote.into(),
                hash: computed_hash,
                timestamp: now_iso(),
            }
        }));
    }

    let mut votes: Vec<ValidatorVote> = Vec::with_capacity(vote_handles.len());
    for handle in vote_handles {
        match handle.await {
            Ok(v) => votes.push(v),
            Err(e) => {
                return Err(Json(ErrorResponse {
                    error: format!("Validator task failed: {e}"),
                    details: None,
                }));
            }
        }
    }

    // ── Tally ───────────────────────────────────────────────────────────
    let approvals = votes.iter().filter(|v| v.vote == "approve").count();
    let total = votes.len();
    let consensus_reached = approvals * 2 > total; // >50 %
    let status = if consensus_reached {
        "verified"
    } else {
        "rejected"
    };

    let result = ValidationResult {
        event_id: event.event_id.clone(),
        status: status.into(),
        votes,
        consensus_reached,
        timestamp: now_iso(),
    };

    // ── Persist result & audit log ──────────────────────────────────────
    {
        let mut st = state.write().await;
        if st.results.len() >= MAX_RESULTS {
            st.results.remove(0);
        }
        st.results.push(result.clone());

        let audit = make_audit(
            "validation",
            &event.event_id,
            &format!("Event {} — {status} ({approvals}/{total} votes)", event.event_id),
            Some(serde_json::json!({
                "backend": backend.name(),
                "approvals": approvals,
                "total": total,
            })),
        );
        if st.audit_log.len() >= MAX_AUDIT {
            st.audit_log.remove(0);
        }
        st.audit_log.push(audit);
    }

    // ── Forward verified events to the analytics service ────────────────
    if consensus_reached {
        let analytics_url = env::var("ANALYTICS_URL")
            .unwrap_or_else(|_| "http://analytics:3004/api/analyze".into());

        let mut forwarded = event.clone();
        forwarded.status = "verified".into();

        let client = reqwest::Client::new();
        if let Err(e) = client.post(&analytics_url).json(&forwarded).send().await {
            tracing::warn!(error = %e, "Failed to forward event to analytics service");
        }
    }

    Ok(Json(result))
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let proof_backend = select_proof_backend();

    let num_validators: usize = env::var("NUM_VALIDATORS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);

    let validators = create_validators(num_validators);
    info!(
        count = validators.len(),
        backend = proof_backend.name(),
        "Validators initialised"
    );

    let state: SharedState = Arc::new(RwLock::new(AppState {
        results: Vec::new(),
        audit_log: Vec::new(),
        validators,
        proof_backend,
    }));

    let cors = CorsLayer::new()
        .allow_origin("*".parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/api/validate", post(validate_event))
        .route("/api/validations", get(get_validations))
        .route("/api/audit", get(get_audit))
        .route("/api/health", get(health))
        .layer(cors)
        .with_state(state);

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3003);

    let addr = format!("0.0.0.0:{port}");
    info!("Validation service listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
