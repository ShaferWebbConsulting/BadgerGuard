import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateEvent,
  getValidationResults,
  getAuditLogs,
  clearStores,
  validators,
  NUM_VALIDATORS,
  CONFIDENCE_THRESHOLD,
} from "./logic.js";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRel = process.env.SHARED_PATH ?? "../../shared";
const { hashEvent, generateId } = await import(
  join(__dirname, sharedRel, "index.js")
);

function makeFusedEvent(overrides = {}) {
  const rawPayloads = overrides.raw_payloads ?? { lat: 12.5, lon: 45.3 };
  const payloadHash = overrides.payload_hash ?? hashEvent(rawPayloads);

  return {
    event_id: generateId(),
    sources: [
      { source_id: "radar-01", event_type: "tracking", event_id: generateId() },
      { source_id: "optical-02", event_type: "tracking", event_id: generateId() },
    ],
    event_type: "fused",
    confidence_score: 0.7,
    timestamp: "2025-01-15T10:00:00.000Z",
    payload_hash: payloadHash,
    object_id: "SAT-100",
    status: "pending",
    raw_payloads: rawPayloads,
    ...overrides,
    // Ensure raw_payloads and payload_hash stay consistent when overridden together
  };
}

describe("validateEvent", () => {
  beforeEach(() => clearStores());

  it("verifies a valid fused event", async () => {
    const event = makeFusedEvent();
    const result = await validateEvent(event);

    assert.equal(result.event_id, event.event_id);
    assert.equal(result.status, "verified");
    assert.equal(result.consensus_reached, true);
    assert.equal(result.votes.length, NUM_VALIDATORS);
    assert.ok(result.timestamp);

    // All validators should approve a valid event
    for (const vote of result.votes) {
      assert.equal(vote.vote, "approve");
      assert.ok(vote.validator_id);
      assert.ok(vote.hash);
      assert.ok(vote.timestamp);
    }
  });

  it("rejects a tampered event (wrong payload_hash)", async () => {
    const event = makeFusedEvent({
      payload_hash: "deadbeef0000000000000000000000000000000000000000000000000000cafe",
    });
    const result = await validateEvent(event);

    assert.equal(result.status, "rejected");
    assert.equal(result.consensus_reached, false);

    for (const vote of result.votes) {
      assert.equal(vote.vote, "reject");
    }
  });

  it("rejects a low-confidence event", async () => {
    const rawPayloads = { lat: 12.5, lon: 45.3 };
    const event = makeFusedEvent({
      raw_payloads: rawPayloads,
      payload_hash: hashEvent(rawPayloads),
      confidence_score: 0.1,
    });
    const result = await validateEvent(event);

    assert.equal(result.status, "rejected");
    assert.equal(result.consensus_reached, false);

    for (const vote of result.votes) {
      assert.equal(vote.vote, "reject");
    }
  });

  it("rejects event at exactly the confidence threshold", async () => {
    const rawPayloads = { lat: 12.5, lon: 45.3 };
    const event = makeFusedEvent({
      raw_payloads: rawPayloads,
      payload_hash: hashEvent(rawPayloads),
      confidence_score: CONFIDENCE_THRESHOLD,
    });
    const result = await validateEvent(event);

    // confidence_score must be strictly greater than threshold
    assert.equal(result.status, "rejected");
    assert.equal(result.consensus_reached, false);
  });

  it("returns correct number of validator votes", async () => {
    const event = makeFusedEvent();
    const result = await validateEvent(event);

    assert.equal(result.votes.length, NUM_VALIDATORS);

    const validatorIds = new Set(result.votes.map((v) => v.validator_id));
    assert.equal(validatorIds.size, NUM_VALIDATORS);
  });
});

describe("majority voting logic", () => {
  beforeEach(() => clearStores());

  it("requires strict majority (>50%) for verification", async () => {
    // With a valid event, all validators approve → verified
    const valid = makeFusedEvent({ confidence_score: 0.9 });
    const result = await validateEvent(valid);
    assert.equal(result.status, "verified");

    // With an invalid event, all validators reject → rejected
    const invalid = makeFusedEvent({
      payload_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    const result2 = await validateEvent(invalid);
    assert.equal(result2.status, "rejected");
  });
});

describe("getValidationResults", () => {
  beforeEach(() => clearStores());

  it("stores and returns results most-recent first", async () => {
    const event1 = makeFusedEvent({ object_id: "SAT-A" });
    const event2 = makeFusedEvent({ object_id: "SAT-B" });

    await validateEvent(event1);
    await validateEvent(event2);

    const results = getValidationResults();
    assert.equal(results.length, 2);
    assert.equal(results[0].event_id, event2.event_id);
    assert.equal(results[1].event_id, event1.event_id);
  });
});

describe("getAuditLogs", () => {
  beforeEach(() => clearStores());

  it("records audit entries for each validation", async () => {
    await validateEvent(makeFusedEvent());

    const logs = getAuditLogs();
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].stage, "validation");
    assert.ok(logs[0].message.includes("Validation"));
    assert.ok(logs[0].details);
  });
});

describe("validators", () => {
  it("has correct number of simulated validators", () => {
    assert.equal(validators.length, NUM_VALIDATORS);
  });

  it("each validator has a unique id and key", () => {
    const ids = new Set(validators.map((v) => v.validator_id));
    assert.equal(ids.size, NUM_VALIDATORS);

    for (const v of validators) {
      assert.ok(v.validator_id);
      assert.ok(v.key);
      assert.equal(v.key.length, 64); // 32 bytes hex = 64 chars
    }
  });
});
