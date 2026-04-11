import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRel = process.env.SHARED_PATH ?? "../../shared";
const sharedDir = join(__dirname, sharedRel);

const sharedModule = existsSync(join(sharedDir, "index.js"))
  ? join(sharedDir, "index.js")
  : join(__dirname, "../../shared/index.js");

const { generateId, hashEvent, nowISO } = await import(sharedModule);

const MAX_STORE = 1000;

/** In-memory stores. */
const analyticsResults = [];
const auditLog = [];

function pushCapped(arr, item) {
  arr.push(item);
  if (arr.length > MAX_STORE) arr.shift();
}

/**
 * Compute an anomaly score (0–1) and classification from a verified event.
 */
function computeAnomalyScore(event) {
  const factors = [];
  let score = 0;

  // Factor 1: confidence — lower confidence → higher anomaly score
  const confidence = event.confidence_score ?? 1;
  const confidencePenalty = 1 - confidence;
  score += confidencePenalty * 0.4;
  if (confidence < 0.5) {
    factors.push("low_confidence");
  }

  // Factor 2: source count — fewer sources → higher anomaly score
  const sourceCount = Array.isArray(event.sources) ? event.sources.length : 0;
  if (sourceCount <= 1) {
    score += 0.3;
    factors.push("single_source");
  } else if (sourceCount === 2) {
    score += 0.1;
    factors.push("limited_sources");
  }

  // Factor 3: any source with event_type "anomaly"
  if (Array.isArray(event.sources)) {
    const hasAnomaly = event.sources.some((s) => s.event_type === "anomaly");
    if (hasAnomaly) {
      score += 0.3;
      factors.push("anomaly_source_detected");
    }
  }

  // Clamp to [0, 1]
  score = Math.min(1, Math.max(0, score));
  score = Math.round(score * 1000) / 1000;

  // Classification thresholds
  let classification;
  if (score >= 0.7) {
    classification = "critical";
  } else if (score >= 0.4) {
    classification = "elevated";
  } else {
    classification = "normal";
  }

  return { anomaly_score: score, classification, factors };
}

/**
 * Analyse a verified fused event.
 * Rejects non-verified events and logs the rejection.
 */
export function analyzeEvent(event) {
  const startTime = performance.now();
  const inputHash = hashEvent(event);

  // Reject non-verified events
  if (!event || event.status !== "verified") {
    const rejectionLog = {
      log_id: generateId(),
      stage: "analytics",
      event_id: event?.event_id ?? "unknown",
      message: `Rejected non-verified event (status: ${event?.status ?? "missing"})`,
      timestamp: nowISO(),
      details: { input_hash: inputHash, rejected: true },
    };
    pushCapped(auditLog, rejectionLog);
    return { rejected: true, reason: "Event status is not verified" };
  }

  const { anomaly_score, classification, factors } = computeAnomalyScore(event);

  const result = {
    event_id: event.event_id,
    analysis_type: "anomaly_classification",
    result: { anomaly_score, classification, factors },
    timestamp: nowISO(),
  };

  const outputHash = hashEvent(result);
  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  result.sandbox_log = {
    input_hash: inputHash,
    output_hash: outputHash,
    execution_time_ms: executionTimeMs,
  };

  pushCapped(analyticsResults, result);

  const audit = {
    log_id: generateId(),
    stage: "analytics",
    event_id: event.event_id,
    message: `Anomaly classification: ${classification} (score ${anomaly_score})`,
    timestamp: nowISO(),
    details: {
      anomaly_score,
      classification,
      factors,
      input_hash: inputHash,
      output_hash: outputHash,
      execution_time_ms: executionTimeMs,
    },
  };
  pushCapped(auditLog, audit);

  return result;
}

/** Return all analytics results, most-recent first. */
export function getAnalyticsResults() {
  return [...analyticsResults].reverse();
}

/** Return audit log entries, most-recent first. */
export function getAuditLogs() {
  return [...auditLog].reverse();
}

/** Clear all stores (for testing). */
export function clearStores() {
  analyticsResults.length = 0;
  auditLog.length = 0;
}
