import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateEvent,
  normalize,
  ingest,
  getEvents,
  getAuditLogs,
  clearStores,
  MAX_STORE,
} from "./logic.js";

/** Helper: returns a valid raw event. */
function validRaw(overrides = {}) {
  return {
    source_id: "radar-01",
    event_type: "tracking",
    payload: { lat: 12.5, lon: 45.3 },
    object_id: "SAT-100",
    timestamp: "2025-01-15T10:00:00.000Z",
    ...overrides,
  };
}

// ───────── Validation ─────────

describe("validateEvent", () => {
  it("accepts a valid event", () => {
    const result = validateEvent(validRaw());
    assert.equal(result.valid, true);
  });

  it("rejects non-object body", () => {
    assert.equal(validateEvent(null).valid, false);
    assert.equal(validateEvent("string").valid, false);
    assert.equal(validateEvent([]).valid, false);
  });

  it("rejects missing source_id", () => {
    const result = validateEvent(validRaw({ source_id: undefined }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("source_id")));
  });

  it("rejects missing event_type", () => {
    const result = validateEvent(validRaw({ event_type: undefined }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("event_type")));
  });

  it("rejects missing payload", () => {
    const result = validateEvent(validRaw({ payload: undefined }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("payload")));
  });

  it("rejects missing object_id", () => {
    const result = validateEvent(validRaw({ object_id: undefined }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("object_id")));
  });

  it("rejects non-object payload", () => {
    const result = validateEvent(validRaw({ payload: "not-an-object" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("payload")));
  });

  it("reports all missing fields at once", () => {
    const result = validateEvent({});
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 4);
  });
});

// ───────── Normalization ─────────

describe("normalize", () => {
  it("assigns an event_id", () => {
    const raw = validRaw();
    const norm = normalize(raw);
    assert.ok(norm.event_id, "event_id should be set");
    assert.ok(
      /^[0-9a-f-]{36}$/.test(norm.event_id),
      "event_id should be a UUID",
    );
  });

  it("preserves existing timestamp", () => {
    const raw = validRaw({ timestamp: "2025-06-01T00:00:00.000Z" });
    const norm = normalize(raw);
    assert.equal(norm.timestamp, "2025-06-01T00:00:00.000Z");
  });

  it("assigns timestamp when missing", () => {
    const raw = validRaw();
    delete raw.timestamp;
    const norm = normalize(raw);
    assert.ok(norm.timestamp, "timestamp should be set");
  });

  it("does not mutate the original event", () => {
    const raw = validRaw();
    const copy = { ...raw };
    normalize(raw);
    assert.deepStrictEqual(raw, copy);
  });
});

// ───────── Ingest + Stores ─────────

describe("ingest & stores", () => {
  beforeEach(() => clearStores());

  it("stores the event and creates an audit entry", () => {
    const norm = normalize(validRaw());
    const { event, audit } = ingest(norm);

    assert.equal(event.event_id, norm.event_id);
    assert.equal(audit.stage, "ingestion");
    assert.equal(audit.event_id, norm.event_id);
    assert.ok(audit.log_id);

    assert.equal(getEvents().length, 1);
    assert.equal(getAuditLogs().length, 1);
  });

  it("returns events most-recent-first", () => {
    const e1 = normalize(validRaw({ source_id: "a" }));
    const e2 = normalize(validRaw({ source_id: "b" }));
    ingest(e1);
    ingest(e2);

    const events = getEvents();
    assert.equal(events[0].source_id, "b");
    assert.equal(events[1].source_id, "a");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      ingest(normalize(validRaw({ source_id: `src-${i}` })));
    }
    assert.equal(getEvents(2).length, 2);
  });

  it("enforces FIFO cap at MAX_STORE", () => {
    for (let i = 0; i < MAX_STORE + 10; i++) {
      ingest(normalize(validRaw({ source_id: `src-${i}` })));
    }
    assert.equal(getEvents().length, MAX_STORE);
    // Oldest entries should have been evicted
    const ids = getEvents().map((e) => e.source_id);
    assert.ok(!ids.includes("src-0"), "oldest event should be evicted");
  });

  it("clearStores empties both stores", () => {
    ingest(normalize(validRaw()));
    clearStores();
    assert.equal(getEvents().length, 0);
    assert.equal(getAuditLogs().length, 0);
  });
});
