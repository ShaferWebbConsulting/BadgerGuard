const INGESTION_URL = process.env.INGESTION_URL || "http://localhost:3001/api/events";
const INTERVAL = parseInt(process.env.INTERVAL, 10) || 4000;

const OBJECT_IDS = ["OBJ-001", "OBJ-002", "OBJ-003", "OBJ-004", "OBJ-005"];
const EVENT_TYPES = ["anomaly", "sensor"];
const SENSOR_TYPES = ["infrared", "radar", "optical"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let eventCount = 0;

function generateEvent() {
  eventCount++;

  const reading = parseFloat((Math.random() * 1000).toFixed(2));
  const threshold = parseFloat((Math.random() * 500 + 250).toFixed(2));
  const anomalyDetected = Math.random() < 0.1;

  const payload = {
    sensor_type: randomFrom(SENSOR_TYPES),
    reading,
    threshold,
    anomaly_detected: anomalyDetected,
  };

  // Every 10th event, simulate a corrupted/malicious event
  if (eventCount % 10 === 0) {
    payload.corrupted = true;
    console.log(`[Source-B] Injecting corrupted event #${eventCount}`);
  }

  return {
    source_id: "sensor-beta",
    event_type: randomFrom(EVENT_TYPES),
    object_id: randomFrom(OBJECT_IDS),
    timestamp: new Date().toISOString(),
    payload,
  };
}

async function sendEvent(event) {
  try {
    const res = await fetch(INGESTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    console.log(
      `[Source-B] Sent ${event.event_type} for ${event.object_id} → ${res.status}`
    );
  } catch (err) {
    console.error(`[Source-B] Connection error: ${err.message}. Will retry…`);
  }
}

let timer = null;

export function start() {
  console.log(
    `[Source-B] Starting — target ${INGESTION_URL}, interval ${INTERVAL}ms`
  );
  timer = setInterval(() => sendEvent(generateEvent()), INTERVAL);
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Source-B] Stopped");
  }
}

// Allow running standalone: node source-b.js
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start();
}
