const VALID_EVENT_TYPES = ["tracking", "anomaly", "sensor", "position"];
const VALID_STATUSES = ["pending", "verified", "rejected"];
const VALID_VOTES = ["approve", "reject"];
const VALID_STAGES = ["ingestion", "fusion", "validation", "analytics"];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Validate a raw ingestion event.
 * Returns { valid: true, data } or { valid: false, errors: string[] }.
 */
export function RawEventSchema(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return { valid: false, errors: ["Event must be a plain object"] };
  }

  if (!isNonEmptyString(event.source_id)) {
    errors.push("source_id must be a non-empty string");
  }
  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    errors.push(
      `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
    );
  }
  if (!isPlainObject(event.payload)) {
    errors.push("payload must be a plain object");
  }
  if (!isNonEmptyString(event.timestamp)) {
    errors.push("timestamp must be a non-empty string");
  } else if (!ISO_DATE_RE.test(event.timestamp)) {
    errors.push("timestamp must be an ISO 8601 UTC string ending in Z");
  }
  if (!isNonEmptyString(event.object_id)) {
    errors.push("object_id must be a non-empty string");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: event };
}

/**
 * Validate a fused event.
 */
export function FusedEventSchema(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return { valid: false, errors: ["Event must be a plain object"] };
  }

  if (!isNonEmptyString(event.event_id) || !UUID_RE.test(event.event_id)) {
    errors.push("event_id must be a valid UUID v4 string");
  }
  if (!Array.isArray(event.sources) || event.sources.length === 0) {
    errors.push("sources must be a non-empty array");
  } else {
    event.sources.forEach((src, i) => {
      if (!isPlainObject(src)) {
        errors.push(`sources[${i}] must be a plain object`);
      }
    });
  }
  if (!isNonEmptyString(event.event_type)) {
    errors.push("event_type must be a non-empty string");
  }
  if (
    typeof event.confidence_score !== "number" ||
    event.confidence_score < 0 ||
    event.confidence_score > 1
  ) {
    errors.push("confidence_score must be a number between 0 and 1");
  }
  if (!isNonEmptyString(event.timestamp)) {
    errors.push("timestamp must be a non-empty string");
  } else if (!ISO_DATE_RE.test(event.timestamp)) {
    errors.push("timestamp must be an ISO 8601 UTC string ending in Z");
  }
  if (!isNonEmptyString(event.payload_hash)) {
    errors.push("payload_hash must be a non-empty string");
  }
  if (!VALID_STATUSES.includes(event.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }
  if (!isNonEmptyString(event.object_id)) {
    errors.push("object_id must be a non-empty string");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: event };
}

/**
 * Validate a validation result.
 */
export function ValidationResultSchema(result) {
  const errors = [];

  if (!isPlainObject(result)) {
    return { valid: false, errors: ["Result must be a plain object"] };
  }

  if (!isNonEmptyString(result.event_id)) {
    errors.push("event_id must be a non-empty string");
  }
  if (!isNonEmptyString(result.validator_id)) {
    errors.push("validator_id must be a non-empty string");
  }
  if (!VALID_VOTES.includes(result.vote)) {
    errors.push(`vote must be one of: ${VALID_VOTES.join(", ")}`);
  }
  if (!isNonEmptyString(result.hash)) {
    errors.push("hash must be a non-empty string");
  }
  if (!isNonEmptyString(result.timestamp)) {
    errors.push("timestamp must be a non-empty string");
  } else if (!ISO_DATE_RE.test(result.timestamp)) {
    errors.push("timestamp must be an ISO 8601 UTC string ending in Z");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: result };
}

/**
 * Validate an analytics result.
 */
export function AnalyticsResultSchema(result) {
  const errors = [];

  if (!isPlainObject(result)) {
    return { valid: false, errors: ["Result must be a plain object"] };
  }

  if (!isNonEmptyString(result.event_id)) {
    errors.push("event_id must be a non-empty string");
  }
  if (!isNonEmptyString(result.analysis_type)) {
    errors.push("analysis_type must be a non-empty string");
  }
  if (!isPlainObject(result.result)) {
    errors.push("result must be a plain object");
  }
  if (!isNonEmptyString(result.timestamp)) {
    errors.push("timestamp must be a non-empty string");
  } else if (!ISO_DATE_RE.test(result.timestamp)) {
    errors.push("timestamp must be an ISO 8601 UTC string ending in Z");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: result };
}

/**
 * Validate an audit log entry.
 */
export function AuditLogSchema(entry) {
  const errors = [];

  if (!isPlainObject(entry)) {
    return { valid: false, errors: ["Entry must be a plain object"] };
  }

  if (!isNonEmptyString(entry.log_id)) {
    errors.push("log_id must be a non-empty string");
  }
  if (!VALID_STAGES.includes(entry.stage)) {
    errors.push(`stage must be one of: ${VALID_STAGES.join(", ")}`);
  }
  if (!isNonEmptyString(entry.event_id)) {
    errors.push("event_id must be a non-empty string");
  }
  if (!isNonEmptyString(entry.message)) {
    errors.push("message must be a non-empty string");
  }
  if (!isNonEmptyString(entry.timestamp)) {
    errors.push("timestamp must be a non-empty string");
  } else if (!ISO_DATE_RE.test(entry.timestamp)) {
    errors.push("timestamp must be an ISO 8601 UTC string ending in Z");
  }
  if (entry.details !== undefined && !isPlainObject(entry.details)) {
    errors.push("details must be a plain object when provided");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: entry };
}
