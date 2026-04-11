import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sharedRel = process.env.SHARED_PATH ?? "../../shared";
const sharedDir = join(__dirname, sharedRel);

const sharedModule = existsSync(join(sharedDir, "index.js"))
  ? join(sharedDir, "index.js")
  : join(__dirname, "../../shared/index.js");

const { generateId, hashEvent, nowISO } = await import(sharedModule);

const NUM_VALIDATORS = parseInt(process.env.NUM_VALIDATORS ?? "3", 10);
const CONFIDENCE_THRESHOLD = 0.3;
const MAX_STORE = 1000;

/** Simulated validator nodes. */
const validators = Array.from({ length: NUM_VALIDATORS }, () => ({
  validator_id: generateId(),
  key: randomBytes(32).toString("hex"),
}));

/** In-memory stores. */
const validationResults = [];
const auditLog = [];

function pushCapped(arr, item) {
  arr.push(item);
  if (arr.length > MAX_STORE) arr.shift();
}

/**
 * Simulate a single validator checking a fused event.
 * Returns a vote object after a random delay (10-100ms).
 */
function simulateValidator(validator, fusedEvent) {
  const delay = Math.floor(Math.random() * 91) + 10;

  return new Promise((resolve) => {
    setTimeout(() => {
      const eventHash = hashEvent(fusedEvent.raw_payloads ?? {});
      const hashValid = fusedEvent.payload_hash === eventHash;
      const confidenceOk = fusedEvent.confidence_score > CONFIDENCE_THRESHOLD;
      const vote = hashValid && confidenceOk ? "approve" : "reject";

      resolve({
        validator_id: validator.validator_id,
        vote,
        hash: eventHash,
        timestamp: nowISO(),
      });
    }, delay);
  });
}

/**
 * Run all validators against a fused event and return the consensus result.
 */
export async function validateEvent(fusedEvent) {
  const votes = await Promise.all(
    validators.map((v) => simulateValidator(v, fusedEvent)),
  );

  const approveCount = votes.filter((v) => v.vote === "approve").length;
  const consensusReached = approveCount > NUM_VALIDATORS / 2;
  const status = consensusReached ? "verified" : "rejected";

  const result = {
    event_id: fusedEvent.event_id,
    status,
    votes,
    consensus_reached: consensusReached,
    timestamp: nowISO(),
  };

  pushCapped(validationResults, result);

  const audit = {
    log_id: generateId(),
    stage: "validation",
    event_id: fusedEvent.event_id,
    message: `Validation ${status}: ${approveCount}/${NUM_VALIDATORS} validators approved`,
    timestamp: nowISO(),
    details: {
      status,
      approve_count: approveCount,
      reject_count: NUM_VALIDATORS - approveCount,
      consensus_reached: consensusReached,
    },
  };
  pushCapped(auditLog, audit);

  return result;
}

/** Return all validation results, most-recent first. */
export function getValidationResults() {
  return [...validationResults].reverse();
}

/** Return audit log entries, most-recent first. */
export function getAuditLogs() {
  return [...auditLog].reverse();
}

/** Clear all stores (for testing). */
export function clearStores() {
  validationResults.length = 0;
  auditLog.length = 0;
}

/** Expose validators for testing. */
export { validators, NUM_VALIDATORS, CONFIDENCE_THRESHOLD };
