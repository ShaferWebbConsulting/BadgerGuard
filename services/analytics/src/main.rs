use std::sync::Arc;
use tokio::sync::RwLock;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use tower_http::cors::CorsLayer;

use tfg_shared::{
    make_audit, hash_json, now_iso,
    AnalyticsOutput, AnalyticsResult, AuditLog, ErrorResponse, FusedEvent,
    HealthResponse, SandboxLog,
};

const MAX_ENTRIES: usize = 1000;

struct AppState {
    results: Vec<AnalyticsResult>,
    audit_log: Vec<AuditLog>,
}

type SharedState = Arc<RwLock<AppState>>;

fn push_capped<T>(vec: &mut Vec<T>, item: T) {
    if vec.len() >= MAX_ENTRIES {
        vec.remove(0);
    }
    vec.push(item);
}

async fn analyze(
    State(state): State<SharedState>,
    Json(event): Json<FusedEvent>,
) -> Result<(StatusCode, Json<AnalyticsResult>), (StatusCode, Json<ErrorResponse>)> {
    if event.status != "verified" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Event not verified — analysis rejected".into(),
                details: None,
            }),
        ));
    }

    let start = std::time::Instant::now();
    let input_value = serde_json::to_value(&event).unwrap_or_default();
    let input_hash = hash_json(&input_value);

    // Anomaly scoring
    let mut score: f64 = 0.0;
    let mut factors: Vec<String> = Vec::new();

    // Confidence penalty
    score += (1.0 - event.confidence_score) * 0.4;

    // Source count factors
    let src_count = event.sources.len();
    if src_count == 1 {
        score += 0.3;
        factors.push("single_source".into());
    } else if src_count == 2 {
        score += 0.1;
        factors.push("limited_sources".into());
    }

    // Anomaly source detection
    if event.sources.iter().any(|s| s.event_type == "anomaly") {
        score += 0.3;
        factors.push("anomaly_source_detected".into());
    }

    score = score.clamp(0.0, 1.0);

    let classification = if score >= 0.7 {
        "critical"
    } else if score >= 0.4 {
        "elevated"
    } else {
        "normal"
    }
    .to_string();

    let output = AnalyticsOutput {
        anomaly_score: score,
        classification,
        factors,
    };

    let output_value = serde_json::to_value(&output).unwrap_or_default();
    let output_hash = hash_json(&output_value);
    let execution_time_ms = start.elapsed().as_secs_f64() * 1000.0;

    let result = AnalyticsResult {
        event_id: event.event_id.clone(),
        analysis_type: "anomaly_classification".into(),
        result: output,
        timestamp: now_iso(),
        sandbox_log: SandboxLog {
            input_hash,
            output_hash,
            execution_time_ms,
        },
    };

    let audit = make_audit(
        "analytics",
        &event.event_id,
        "Anomaly analysis completed",
        Some(serde_json::json!({
            "anomaly_score": result.result.anomaly_score,
            "classification": result.result.classification,
        })),
    );

    {
        let mut s = state.write().await;
        push_capped(&mut s.results, result.clone());
        push_capped(&mut s.audit_log, audit);
    }

    Ok((StatusCode::OK, Json(result)))
}

#[derive(Deserialize)]
struct LimitQuery {
    limit: Option<usize>,
}

async fn get_results(
    State(state): State<SharedState>,
    Query(q): Query<LimitQuery>,
) -> Json<Vec<AnalyticsResult>> {
    let s = state.read().await;
    let mut results: Vec<AnalyticsResult> = s.results.iter().rev().cloned().collect();
    if let Some(limit) = q.limit {
        results.truncate(limit);
    }
    Json(results)
}

async fn get_audit(State(state): State<SharedState>) -> Json<Vec<AuditLog>> {
    let s = state.read().await;
    Json(s.audit_log.clone())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "analytics".into(),
    })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state: SharedState = Arc::new(RwLock::new(AppState {
        results: Vec::new(),
        audit_log: Vec::new(),
    }));

    let app = Router::new()
        .route("/api/analyze", post(analyze))
        .route("/api/results", get(get_results))
        .route("/api/audit", get(get_audit))
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3004);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("Analytics service listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
