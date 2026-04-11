import { createHash, randomUUID } from "node:crypto";

/** Generate a UUID v4. */
export function generateId() {
  return randomUUID();
}

/** Return a SHA-256 hex digest of the JSON-serialised event. */
export function hashEvent(event) {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

/** Return the current time as an ISO 8601 string. */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Normalise a raw event by assigning an event_id and a
 * normalised timestamp.  Returns a new object (does not mutate).
 */
export function normalizeEvent(rawEvent) {
  return {
    ...rawEvent,
    event_id: generateId(),
    timestamp: rawEvent.timestamp ?? nowISO(),
  };
}
