const INGESTION_URL = process.env.INGESTION_URL || "http://localhost:3001/api/events";
const INTERVAL = parseInt(process.env.INTERVAL, 10) || 3000;

const OBJECT_IDS = ["OBJ-001", "OBJ-002", "OBJ-003", "OBJ-004", "OBJ-005"];
const EVENT_TYPES = ["tracking", "position"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEvent() {
  return {
    source_id: "satellite-alpha",
    event_type: randomFrom(EVENT_TYPES),
    object_id: randomFrom(OBJECT_IDS),
    timestamp: new Date().toISOString(),
    payload: {
      latitude: parseFloat((Math.random() * 180 - 90).toFixed(6)),
      longitude: parseFloat((Math.random() * 360 - 180).toFixed(6)),
      altitude: parseFloat((Math.random() * 35000 + 200).toFixed(2)),
      velocity: parseFloat((Math.random() * 8 + 1).toFixed(3)),
      heading: parseFloat((Math.random() * 360).toFixed(2)),
    },
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
      `[Source-A] Sent ${event.event_type} for ${event.object_id} → ${res.status}`
    );
  } catch (err) {
    console.error(`[Source-A] Connection error: ${err.message}. Will retry…`);
  }
}

let timer = null;

export function start() {
  console.log(
    `[Source-A] Starting — target ${INGESTION_URL}, interval ${INTERVAL}ms`
  );
  timer = setInterval(() => sendEvent(generateEvent()), INTERVAL);
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Source-A] Stopped");
  }
}

// Allow running standalone: node source-a.js
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start();
}
