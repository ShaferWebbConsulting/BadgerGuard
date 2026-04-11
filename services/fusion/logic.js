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
  FusedEventSchema,
  AuditLogSchema,
} = await import(sharedModule);

const TIME_WINDOW = parseInt(process.env.TIME_WINDOW ?? "10000", 10);
const MAX_STORE = 1000;

/** Buffer of pending events keyed by object_id. */
const fusionBuffer = new Map();

/** Completed fused events (most-recent last). */
const fusedEvents = [];

/** Audit log entries (most-recent last). */
const auditLog = [];

// --- helpers ----------------------------------------------------------------

export function confidenceScore(sources) {
  const hasCorrupted = sources.some((s) => s._corrupted);
  if (hasCorrupted) return 0.1;
  if (sources.length >= 3) return 0.9;
  if (sources.length === 2) return 0.7;
  return 0.5;
}

function buildFusedEvent(objectId, matched) {
  const sources = matched.map((m) => ({
    source_id: m.source_id,
    event_type: m.event_type,
    event_id: m.event_id,
  }));

  const rawPayloads = Object.assign({}, ...matched.map((m) => m.payload));

  const score = confidenceScore(
    matched.map((m) => ({
      ...m,
      _corrupted: m.payload?.corrupted === true,
    })),
  );

  const fused = {
    event_id: generateId(),
    sources,
    event_type: "fused",
    confidence_score: score,
    timestamp: nowISO(),
    payload_hash: hashEvent(rawPayloads),
    object_id: objectId,
    status: "pending",
    raw_payloads: rawPayloads,
  };

  return fused;
}

function pushCapped(arr, item) {
  arr.push(item);
  if (arr.length > MAX_STORE) arr.shift();
}

// --- public API -------------------------------------------------------------

/**
 * Add an event to the fusion buffer. If events from 2+ distinct sources exist
 * for the same object_id within TIME_WINDOW, fuse them and return the result.
 */
export function addEvent(event) {
  const { object_id } = event;

  if (!fusionBuffer.has(object_id)) {
    fusionBuffer.set(object_id, []);
  }

  fusionBuffer.get(object_id).push({
    ...event,
    _receivedAt: Date.now(),
  });

  // Collect events within the time window from distinct sources
  const bucket = fusionBuffer.get(object_id);
  const now = Date.now();
  const active = bucket.filter((e) => now - e._receivedAt <= TIME_WINDOW);

  const distinctSources = new Set(active.map((e) => e.source_id));

  if (distinctSources.size >= 2) {
    // Pick one event per distinct source (the latest one)
    const perSource = new Map();
    for (const e of active) {
      perSource.set(e.source_id, e);
    }
    const matched = [...perSource.values()];

    const fused = buildFusedEvent(object_id, matched);

    // Validate fused event against schema (excluding raw_payloads)
    const { raw_payloads, ...schemaCheck } = fused;
    const validation = FusedEventSchema(schemaCheck);
    if (!validation.valid) {
      const entry = {
        log_id: generateId(),
        stage: "fusion",
        event_id: fused.event_id,
        message: `Fusion schema validation failed: ${validation.errors.join(", ")}`,
        timestamp: nowISO(),
      };
      pushCapped(auditLog, entry);
      return { fused: null, audit: entry };
    }

    pushCapped(fusedEvents, fused);

    // Remove matched events from buffer
    const matchedIds = new Set(matched.map((m) => m.event_id));
    const remaining = bucket.filter((e) => !matchedIds.has(e.event_id));
    if (remaining.length === 0) {
      fusionBuffer.delete(object_id);
    } else {
      fusionBuffer.set(object_id, remaining);
    }

    const audit = {
      log_id: generateId(),
      stage: "fusion",
      event_id: fused.event_id,
      message: `Fused ${matched.length} events for object ${object_id}`,
      timestamp: nowISO(),
      details: {
        object_id,
        source_count: matched.length,
        confidence_score: fused.confidence_score,
      },
    };
    pushCapped(auditLog, audit);

    return { fused, audit };
  }

  // No fusion yet — event buffered
  const audit = {
    log_id: generateId(),
    stage: "fusion",
    event_id: event.event_id,
    message: `Buffered event from source ${event.source_id} for object ${object_id}`,
    timestamp: nowISO(),
    details: { object_id, source_id: event.source_id },
  };
  pushCapped(auditLog, audit);

  return { fused: null, audit };
}

/** Return fused events, most-recent first. Optional limit. */
export function getFusedEvents(limit = 0) {
  const sorted = [...fusedEvents].reverse();
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

/** Return audit log entries, most-recent first. */
export function getAuditLogs() {
  return [...auditLog].reverse();
}

/** Remove buffered events older than TIME_WINDOW. */
export function cleanExpired() {
  const now = Date.now();
  for (const [objectId, bucket] of fusionBuffer) {
    const active = bucket.filter((e) => now - e._receivedAt <= TIME_WINDOW);
    if (active.length === 0) {
      fusionBuffer.delete(objectId);
    } else {
      fusionBuffer.set(objectId, active);
    }
  }
}

/** Clear all stores (for testing). */
export function clearStores() {
  fusionBuffer.clear();
  fusedEvents.length = 0;
  auditLog.length = 0;
}
