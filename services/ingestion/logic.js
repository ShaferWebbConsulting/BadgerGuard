import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRel = process.env.SHARED_PATH ?? "../../shared";
const sharedDir = join(__dirname, sharedRel);

const sharedModule = existsSync(join(sharedDir, "index.js"))
  ? join(sharedDir, "index.js")
  : join(__dirname, "../../shared/index.js");

const {
  generateId,
  hashEvent,
  nowISO,
  normalizeEvent,
  RawEventSchema,
  AuditLogSchema,
} = await import(sharedModule);

// --------------- In-memory stores (FIFO, max 1000) ---------------

const MAX_STORE = 1000;
const eventStore = [];
const auditLog = [];

function pushCapped(arr, item) {
  arr.push(item);
  if (arr.length > MAX_STORE) arr.shift();
}

// --------------- Core helpers ---------------

const REQUIRED_FIELDS = ["source_id", "event_type", "payload", "object_id"];

/**
 * Validate that the raw event has the required fields and passes schema
 * validation. Returns { valid, errors?, data? }.
 */
export function validateEvent(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  const errors = [];

  for (const f of REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null) {
      errors.push(`Missing required field: ${f}`);
    } else if (f === "payload") {
      if (typeof raw[f] !== "object" || Array.isArray(raw[f])) {
        errors.push("payload must be a plain object");
      }
    } else if (typeof raw[f] === "string" && raw[f].trim() === "") {
      errors.push(`${f} must be a non-empty string`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: raw };
}

/**
 * Normalize a raw event — assigns event_id and timestamp.
 */
export function normalize(raw) {
  return normalizeEvent(raw);
}

/**
 * Store a normalized event and create an audit log entry.
 * Returns { event, audit }.
 */
export function ingest(normalizedEvent) {
  pushCapped(eventStore, normalizedEvent);

  const audit = {
    log_id: generateId(),
    stage: "ingestion",
    event_id: normalizedEvent.event_id,
    message: `Ingested event from source ${normalizedEvent.source_id}`,
    timestamp: nowISO(),
    details: {
      source_id: normalizedEvent.source_id,
      event_type: normalizedEvent.event_type,
      object_id: normalizedEvent.object_id,
    },
  };
  pushCapped(auditLog, audit);

  return { event: normalizedEvent, audit };
}

/**
 * Return stored events (most recent first), optionally limited.
 */
export function getEvents(limit) {
  const sorted = [...eventStore].reverse();
  if (limit && limit > 0) return sorted.slice(0, limit);
  return sorted;
}

/**
 * Return all audit log entries (most recent first).
 */
export function getAuditLogs() {
  return [...auditLog].reverse();
}

/**
 * Clear stores — useful for testing.
 */
export function clearStores() {
  eventStore.length = 0;
  auditLog.length = 0;
}

export { generateId, nowISO, hashEvent, MAX_STORE };
