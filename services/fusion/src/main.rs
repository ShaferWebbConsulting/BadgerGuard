use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::{Path, Query, State},
    http::{HeaderValue, Method},
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

use tfg_shared::{
    generate_id, hash_json, make_audit, now_iso, AuditLog, FusedEvent, FusedEventSource,
    HealthResponse, NormalizedEvent,
};

// ── BufferedEvent ───────────────────────────────────────────────────────────

struct BufferedEvent {
    event: NormalizedEvent,
    received_at: Instant,
}

// ── AppState ────────────────────────────────────────────────────────────────

struct AppState {
    buffer: HashMap<String, Vec<BufferedEvent>>,
    fused_events: Vec<FusedEvent>,
    audit_log: Vec<AuditLog>,
    time_window: Duration,
}

type SharedState = Arc<RwLock<AppState>>;

const MAX_STORED: usize = 1000;

// ── Fusion logic ────────────────────────────────────────────────────────────

fn try_fuse(state: &mut AppState, object_id: &str) -> Option<FusedEvent> {
    let entries = state.buffer.get(object_id)?;
    let now = Instant::now();

    // Keep only events within the time window
    let active: Vec<&BufferedEvent> = entries
        .iter()
        .filter(|b| now.duration_since(b.received_at) <= state.time_window)
        .collect();

    // Need events from 2+ different source_ids
    let mut source_ids = std::collections::HashSet::new();
    for b in &active {
        source_ids.insert(b.event.source_id.clone());
    }
    if source_ids.len() < 2 {
        return None;
    }

    // Build sources list and merge payloads
    let mut sources = Vec::new();
    let mut merged = serde_json::Map::new();
    let mut has_corrupted = false;

    for b in &active {
        sources.push(FusedEventSource {
            source_id: b.event.source_id.clone(),
            event_type: b.event.event_type.clone(),
            event_id: b.event.event_id.clone(),
        });

        if let serde_json::Value::Object(map) = &b.event.payload {
            for (k, v) in map {
                merged.insert(k.clone(), v.clone());
            }
            if map.get("corrupted") == Some(&serde_json::Value::Bool(true)) {
                has_corrupted = true;
            }
        }
    }

    let raw_payloads = serde_json::Value::Object(merged.clone());
    let payload_hash = hash_json(&raw_payloads);

    let confidence_score = if has_corrupted {
        0.1
    } else if sources.len() >= 3 {
        0.9
    } else {
        0.7
    };

    let fused = FusedEvent {
        event_id: generate_id(),
        sources,
        event_type: "fused".into(),
        confidence_score,
        timestamp: now_iso(),
        payload_hash,
        object_id: object_id.into(),
        status: "pending".into(),
        raw_payloads,
    };

    // Remove matched events from buffer
    state.buffer.remove(object_id);

    // Store fused event (FIFO cap)
    state.fused_events.push(fused.clone());
    if state.fused_events.len() > MAX_STORED {
        state.fused_events.remove(0);
    }

    // Audit
    let audit = make_audit(
        "fusion",
        &fused.event_id,
        &format!(
            "Fused {} sources for object {}",
            fused.sources.len(),
            object_id
        ),
        None,
    );
    state.audit_log.push(audit);
    if state.audit_log.len() > MAX_STORED {
        state.audit_log.remove(0);
    }

    Some(fused)
}

// ── Handlers ────────────────────────────────────────────────────────────────

async fn post_fuse(
    State(state): State<SharedState>,
    Json(event): Json<NormalizedEvent>,
) -> axum::response::Response {
    let object_id = event.object_id.clone();

    let fused = {
        let mut s = state.write().await;

        // Audit receive
        let audit = make_audit(
            "fusion",
            &event.event_id,
            &format!("Received event for object {}", &object_id),
            None,
        );
        s.audit_log.push(audit);
        if s.audit_log.len() > MAX_STORED {
            s.audit_log.remove(0);
        }

        // Buffer
        s.buffer
            .entry(object_id.clone())
            .or_default()
            .push(BufferedEvent {
                event,
                received_at: Instant::now(),
            });

        try_fuse(&mut s, &object_id)
    };

    match fused {
        Some(fused_event) => {
            // Best-effort forward to validation
            let fe = fused_event.clone();
            tokio::spawn(async move {
                let url = std::env::var("VALIDATION_URL")
                    .unwrap_or_else(|_| "http://validation:3003/api/validate".into());
                let _ = reqwest::Client::new().post(&url).json(&fe).send().await;
            });

            (axum::http::StatusCode::OK, Json(fused_event)).into_response()
        }
        None => {
            let body = serde_json::json!({
                "status": "buffered",
                "object_id": object_id,
            });
            (axum::http::StatusCode::ACCEPTED, Json(body)).into_response()
        }
    }
}

use axum::response::IntoResponse;

#[derive(Deserialize)]
struct LimitQuery {
    limit: Option<usize>,
}

async fn get_fused_events(
    State(state): State<SharedState>,
    Query(q): Query<LimitQuery>,
) -> Json<Vec<FusedEvent>> {
    let s = state.read().await;
    let limit = q.limit.unwrap_or(s.fused_events.len());
    let events: Vec<FusedEvent> = s.fused_events.iter().rev().take(limit).cloned().collect();
    Json(events)
}

async fn get_audit(State(state): State<SharedState>) -> Json<Vec<AuditLog>> {
    let s = state.read().await;
    Json(s.audit_log.clone())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "fusion".into(),
    })
}

#[derive(Deserialize)]
struct StatusUpdate {
    status: String,
}

async fn update_fused_event_status(
    State(state): State<SharedState>,
    Path(event_id): Path<String>,
    Json(body): Json<StatusUpdate>,
) -> axum::response::Response {
    let mut s = state.write().await;
    if let Some(ev) = s.fused_events.iter_mut().find(|e| e.event_id == event_id) {
        ev.status = body.status.clone();

        let audit = make_audit(
            "fusion",
            &event_id,
            &format!("Status updated to '{}'", body.status),
            None,
        );
        if s.audit_log.len() > MAX_STORED {
            s.audit_log.remove(0);
        }
        s.audit_log.push(audit);

        (axum::http::StatusCode::OK, Json(serde_json::json!({"updated": true}))).into_response()
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "event not found"}))).into_response()
    }
}

// ── Background cleanup ─────────────────────────────────────────────────────

fn spawn_cleanup(state: SharedState) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let mut s = state.write().await;
            let window = s.time_window;
            let now = Instant::now();
            s.buffer.retain(|_, events| {
                events.retain(|b| now.duration_since(b.received_at) <= window);
                !events.is_empty()
            });
        }
    });
}

// ── Main ────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let time_window_ms: u64 = std::env::var("TIME_WINDOW")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10_000);

    let state: SharedState = Arc::new(RwLock::new(AppState {
        buffer: HashMap::new(),
        fused_events: Vec::new(),
        audit_log: Vec::new(),
        time_window: Duration::from_millis(time_window_ms),
    }));

    spawn_cleanup(state.clone());

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
        .route("/api/fuse", post(post_fuse))
        .route("/api/fused-events", get(get_fused_events))
        .route("/api/fused-events/{event_id}/status", patch(update_fused_event_status))
        .route("/api/audit", get(get_audit))
        .route("/api/health", get(health))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3002);

    let addr = format!("0.0.0.0:{port}");
    info!("Fusion service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
