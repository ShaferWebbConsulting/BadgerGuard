import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeEvent,
  getAnalyticsResults,
  getAuditLogs,
  clearStores,
} from "./logic.js";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRel = process.env.SHARED_PATH ?? "../../shared";
const { hashEvent, generateId } = await import(
  join(__dirname, sharedRel, "index.js")
);

function makeVerifiedEvent(overrides = {}) {
  return {
    event_id: generateId(),
    sources: [
      { source_id: "radar-01", event_type: "tracking", event_id: generateId() },
      { source_id: "optical-02", event_type: "tracking", event_id: generateId() },
    ],
    event_type: "fused",
    confidence_score: 0.85,
    timestamp: "2025-01-15T10:00:00.000Z",
    payload_hash: "abc123",
    object_id: "SAT-100",
    status: "verified",
    raw_payloads: { lat: 12.5, lon: 45.3 },
    ...overrides,
  };
}

describe("analyzeEvent – verified events", () => {
  beforeEach(() => clearStores());

  it("accepts and analyses a verified event", () => {
    const event = makeVerifiedEvent();
    const result = analyzeEvent(event);

    assert.equal(result.event_id, event.event_id);
    assert.equal(result.analysis_type, "anomaly_classification");
    assert.ok(result.timestamp);
    assert.ok(result.sandbox_log);
    assert.equal(typeof result.result.anomaly_score, "number");
    assert.ok(["normal", "elevated", "critical"].includes(result.result.classification));
    assert.ok(Array.isArray(result.result.factors));
  });

  it("stores result in analytics results", () => {
    analyzeEvent(makeVerifiedEvent());
    const results = getAnalyticsResults();
    assert.equal(results.length, 1);
  });
});

describe("analyzeEvent – non-verified events", () => {
  beforeEach(() => clearStores());

  it("rejects events with status 'pending'", () => {
    const event = makeVerifiedEvent({ status: "pending" });
    const result = analyzeEvent(event);

    assert.equal(result.rejected, true);
    assert.ok(result.reason);
  });

  it("rejects events with status 'rejected'", () => {
    const event = makeVerifiedEvent({ status: "rejected" });
    const result = analyzeEvent(event);

    assert.equal(result.rejected, true);
  });

  it("does not store rejected events in analytics results", () => {
    analyzeEvent(makeVerifiedEvent({ status: "pending" }));
    assert.equal(getAnalyticsResults().length, 0);
  });

  it("logs rejection in audit log", () => {
    analyzeEvent(makeVerifiedEvent({ status: "pending" }));
    const logs = getAuditLogs();
    assert.ok(logs.length >= 1);
    assert.ok(logs[0].message.includes("Rejected"));
    assert.equal(logs[0].details.rejected, true);
  });
});

describe("anomaly classification logic", () => {
  beforeEach(() => clearStores());

  it("classifies high-confidence multi-source event as normal", () => {
    const event = makeVerifiedEvent({
      confidence_score: 0.95,
      sources: [
        { source_id: "r1", event_type: "tracking", event_id: generateId() },
        { source_id: "r2", event_type: "tracking", event_id: generateId() },
        { source_id: "r3", event_type: "tracking", event_id: generateId() },
      ],
    });
    const result = analyzeEvent(event);
    assert.equal(result.result.classification, "normal");
    assert.ok(result.result.anomaly_score < 0.4);
  });

  it("increases score when an anomaly source is present", () => {
    const normal = makeVerifiedEvent({
      confidence_score: 0.9,
      sources: [
        { source_id: "r1", event_type: "tracking", event_id: generateId() },
        { source_id: "r2", event_type: "tracking", event_id: generateId() },
        { source_id: "r3", event_type: "tracking", event_id: generateId() },
      ],
    });
    const withAnomaly = makeVerifiedEvent({
      confidence_score: 0.9,
      sources: [
        { source_id: "r1", event_type: "tracking", event_id: generateId() },
        { source_id: "r2", event_type: "anomaly", event_id: generateId() },
        { source_id: "r3", event_type: "tracking", event_id: generateId() },
      ],
    });

    const normalResult = analyzeEvent(normal);
    const anomalyResult = analyzeEvent(withAnomaly);

    assert.ok(anomalyResult.result.anomaly_score > normalResult.result.anomaly_score);
    assert.ok(anomalyResult.result.factors.includes("anomaly_source_detected"));
  });

  it("classifies low-confidence single-source as critical", () => {
    const event = makeVerifiedEvent({
      confidence_score: 0.2,
      sources: [
        { source_id: "r1", event_type: "anomaly", event_id: generateId() },
      ],
    });
    const result = analyzeEvent(event);
    assert.equal(result.result.classification, "critical");
    assert.ok(result.result.anomaly_score >= 0.7);
    assert.ok(result.result.factors.includes("low_confidence"));
    assert.ok(result.result.factors.includes("single_source"));
    assert.ok(result.result.factors.includes("anomaly_source_detected"));
  });

  it("classifies medium-risk events as elevated", () => {
    const event = makeVerifiedEvent({
      confidence_score: 0.5,
      sources: [
        { source_id: "r1", event_type: "tracking", event_id: generateId() },
      ],
    });
    const result = analyzeEvent(event);
    assert.equal(result.result.classification, "elevated");
  });
});

describe("sandbox logging", () => {
  beforeEach(() => clearStores());

  it("includes input and output hashes in sandbox_log", () => {
    const event = makeVerifiedEvent();
    const result = analyzeEvent(event);

    assert.ok(result.sandbox_log.input_hash);
    assert.ok(result.sandbox_log.output_hash);
    assert.equal(typeof result.sandbox_log.execution_time_ms, "number");
  });

  it("input_hash matches hashEvent of the input", () => {
    const event = makeVerifiedEvent();
    const result = analyzeEvent(event);
    const expectedHash = hashEvent(event);
    assert.equal(result.sandbox_log.input_hash, expectedHash);
  });

  it("records sandbox details in audit log", () => {
    analyzeEvent(makeVerifiedEvent());
    const logs = getAuditLogs();
    assert.ok(logs[0].details.input_hash);
    assert.ok(logs[0].details.output_hash);
    assert.equal(typeof logs[0].details.execution_time_ms, "number");
  });
});

describe("getAnalyticsResults", () => {
  beforeEach(() => clearStores());

  it("returns results most-recent first", () => {
    const e1 = makeVerifiedEvent({ object_id: "SAT-A" });
    const e2 = makeVerifiedEvent({ object_id: "SAT-B" });

    analyzeEvent(e1);
    analyzeEvent(e2);

    const results = getAnalyticsResults();
    assert.equal(results.length, 2);
    assert.equal(results[0].event_id, e2.event_id);
    assert.equal(results[1].event_id, e1.event_id);
  });
});

describe("getAuditLogs", () => {
  beforeEach(() => clearStores());

  it("records audit entries for each analysis", () => {
    analyzeEvent(makeVerifiedEvent());
    const logs = getAuditLogs();
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].stage, "analytics");
    assert.ok(logs[0].message.includes("Anomaly classification"));
  });
});
