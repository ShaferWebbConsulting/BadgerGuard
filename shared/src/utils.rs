use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::schemas::{AuditLog, NormalizedEvent, RawEvent};

/// Generate a UUID v4 string.
pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

/// Return the current time as an ISO-8601 string.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Deterministic SHA-256 hash of a JSON value (sorted keys).
pub fn hash_json(value: &serde_json::Value) -> String {
    let canonical = canonical_json(value);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Produce a deterministic JSON string with sorted keys.
fn canonical_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let entries: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap(), canonical_json(&map[*k])))
                .collect();
            format!("{{{}}}", entries.join(","))
        }
        serde_json::Value::Array(arr) => {
            let entries: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", entries.join(","))
        }
        _ => serde_json::to_string(value).unwrap(),
    }
}

/// Validate a raw event has the required fields.
pub fn validate_raw_event(event: &RawEvent) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    if event.source_id.is_empty() {
        errors.push("source_id is required".into());
    }
    if event.event_type.is_empty() {
        errors.push("event_type is required".into());
    }
    if event.object_id.is_empty() {
        errors.push("object_id is required".into());
    }
    if event.payload.is_null() {
        errors.push("payload is required".into());
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Normalize a raw event into a NormalizedEvent with a generated ID and timestamp.
pub fn normalize_event(raw: &RawEvent) -> NormalizedEvent {
    NormalizedEvent {
        source_id: raw.source_id.clone(),
        event_type: raw.event_type.clone(),
        object_id: raw.object_id.clone(),
        payload: raw.payload.clone(),
        event_id: raw.event_id.clone().unwrap_or_else(generate_id),
        timestamp: raw.timestamp.clone().unwrap_or_else(now_iso),
    }
}

/// Create an audit log entry.
pub fn make_audit(
    stage: &str,
    event_id: &str,
    message: &str,
    details: Option<serde_json::Value>,
) -> AuditLog {
    AuditLog {
        log_id: generate_id(),
        stage: stage.into(),
        event_id: event_id.into(),
        message: message.into(),
        timestamp: now_iso(),
        details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id_is_uuid() {
        let id = generate_id();
        assert!(Uuid::parse_str(&id).is_ok());
    }

    #[test]
    fn test_hash_json_deterministic() {
        let v1: serde_json::Value = serde_json::json!({"b": 2, "a": 1});
        let v2: serde_json::Value = serde_json::json!({"a": 1, "b": 2});
        assert_eq!(hash_json(&v1), hash_json(&v2));
    }

    #[test]
    fn test_validate_raw_event_ok() {
        let ev = RawEvent {
            source_id: "src".into(),
            event_type: "tracking".into(),
            object_id: "OBJ-001".into(),
            payload: serde_json::json!({"x": 1}),
            event_id: None,
            timestamp: None,
        };
        assert!(validate_raw_event(&ev).is_ok());
    }

    #[test]
    fn test_validate_raw_event_missing_fields() {
        let ev = RawEvent {
            source_id: "".into(),
            event_type: "".into(),
            object_id: "".into(),
            payload: serde_json::Value::Null,
            event_id: None,
            timestamp: None,
        };
        let err = validate_raw_event(&ev).unwrap_err();
        assert_eq!(err.len(), 4);
    }

    #[test]
    fn test_normalize_event_assigns_id() {
        let ev = RawEvent {
            source_id: "src".into(),
            event_type: "tracking".into(),
            object_id: "OBJ-001".into(),
            payload: serde_json::json!({}),
            event_id: None,
            timestamp: None,
        };
        let norm = normalize_event(&ev);
        assert!(!norm.event_id.is_empty());
        assert!(!norm.timestamp.is_empty());
    }
}
