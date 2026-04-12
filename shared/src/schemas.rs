use serde::{Deserialize, Serialize};

// ── Raw Event (incoming from data sources) ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawEvent {
    pub source_id: String,
    pub event_type: String,
    pub object_id: String,
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

/// A normalized event has guaranteed event_id and timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedEvent {
    pub source_id: String,
    pub event_type: String,
    pub object_id: String,
    pub payload: serde_json::Value,
    pub event_id: String,
    pub timestamp: String,
}

// ── Fused Event ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FusedEventSource {
    pub source_id: String,
    pub event_type: String,
    pub event_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FusedEvent {
    pub event_id: String,
    pub sources: Vec<FusedEventSource>,
    pub event_type: String,
    pub confidence_score: f64,
    pub timestamp: String,
    pub payload_hash: String,
    pub object_id: String,
    pub status: String,
    pub raw_payloads: serde_json::Value,
}

// ── Validation ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorVote {
    pub validator_id: String,
    pub vote: String,
    pub hash: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub event_id: String,
    pub status: String,
    pub votes: Vec<ValidatorVote>,
    pub consensus_reached: bool,
    pub timestamp: String,
}

// ── Analytics ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsOutput {
    pub anomaly_score: f64,
    pub classification: String,
    pub factors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxLog {
    pub input_hash: String,
    pub output_hash: String,
    pub execution_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsResult {
    pub event_id: String,
    pub analysis_type: String,
    pub result: AnalyticsOutput,
    pub timestamp: String,
    pub sandbox_log: SandboxLog,
}

// ── Audit Log ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub log_id: String,
    pub stage: String,
    pub event_id: String,
    pub message: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

// ── Health ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
}

// ── Error ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<String>>,
}
