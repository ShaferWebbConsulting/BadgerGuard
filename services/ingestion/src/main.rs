use std::env;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::warn;

use tfg_shared::{
    make_audit, normalize_event, validate_raw_event, AuditLog, ErrorResponse, HealthResponse,
    NormalizedEvent, RawEvent,
};

const MAX_ITEMS: usize = 1000;

struct AppState {
    events: Vec<NormalizedEvent>,
    audit_log: Vec<AuditLog>,
    http_client: reqwest::Client,
    fusion_url: String,
}

type SharedState = Arc<RwLock<AppState>>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3001);

    let fusion_url =
        env::var("FUSION_URL").unwrap_or_else(|_| "http://fusion:3002/api/fuse".into());

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("failed to build HTTP client");

    let state: SharedState = Arc::new(RwLock::new(AppState {
        events: Vec::new(),
        audit_log: Vec::new(),
        http_client,
        fusion_url,
    }));

    let app = Router::new()
        .route("/api/events", post(ingest_event).get(list_events))
        .route("/api/audit", get(list_audit))
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind");

    tracing::info!("ingestion service listening on port {port}");
    axum::serve(listener, app).await.expect("server error");
}

// ── POST /api/events ────────────────────────────────────────────────────────

async fn ingest_event(
    State(state): State<SharedState>,
    Json(raw): Json<RawEvent>,
) -> Result<(StatusCode, Json<NormalizedEvent>), (StatusCode, Json<ErrorResponse>)> {
    if let Err(errors) = validate_raw_event(&raw) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Validation failed".into(),
                details: Some(errors),
            }),
        ));
    }

    let normalized = normalize_event(&raw);
    let audit = make_audit(
        "ingestion",
        &normalized.event_id,
        "Event ingested and normalized",
        None,
    );

    {
        let mut s = state.write().await;
        s.events.push(normalized.clone());
        if s.events.len() > MAX_ITEMS {
            s.events.remove(0);
        }
        s.audit_log.push(audit);
        if s.audit_log.len() > MAX_ITEMS {
            s.audit_log.remove(0);
        }
    }

    // Best-effort forward to fusion service in the background.
    let event_clone = normalized.clone();
    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        let (client, url) = {
            let s = state_clone.read().await;
            (s.http_client.clone(), s.fusion_url.clone())
        };
        if let Err(e) = client.post(&url).json(&event_clone).send().await {
            warn!("failed to forward event to fusion: {e}");
        }
    });

    Ok((StatusCode::CREATED, Json(normalized)))
}

// ── GET /api/events ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct LimitParams {
    limit: Option<usize>,
}

async fn list_events(
    State(state): State<SharedState>,
    Query(params): Query<LimitParams>,
) -> Json<Vec<NormalizedEvent>> {
    let s = state.read().await;
    let mut events: Vec<NormalizedEvent> = s.events.iter().rev().cloned().collect();
    if let Some(limit) = params.limit {
        events.truncate(limit);
    }
    Json(events)
}

// ── GET /api/audit ──────────────────────────────────────────────────────────

async fn list_audit(State(state): State<SharedState>) -> Json<Vec<AuditLog>> {
    let s = state.read().await;
    Json(s.audit_log.clone())
}

// ── GET /api/health ─────────────────────────────────────────────────────────

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "ingestion".into(),
    })
}
