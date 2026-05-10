const INGESTION_URL = process.env.INGESTION_URL || "http://localhost:3001/api/events";
const INTERVAL = parseInt(process.env.INTERVAL, 10) || 3000;

const OBJECT_IDS = ["OBJ-001", "OBJ-002", "OBJ-003", "OBJ-004", "OBJ-005"];
const PLATFORM_IDS = ["fleet-leader-node", "isr-drone"];
const EVENT_TYPES = ["mission_state", "flight_state", "autonomy_coa"];
const MISSION_STATES = ["contested-airspace", "mission-replanning", "on-station", "degraded-comms"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEvent() {
  return {
    source_id: randomFrom(PLATFORM_IDS),
    event_type: randomFrom(EVENT_TYPES),
    object_id: randomFrom(OBJECT_IDS),
    timestamp: new Date().toISOString(),
    payload: {
      mission_state: randomFrom(MISSION_STATES),
      latitude: parseFloat((Math.random() * 180 - 90).toFixed(6)),
      longitude: parseFloat((Math.random() * 360 - 180).toFixed(6)),
      altitude: parseFloat((Math.random() * 35000 + 200).toFixed(2)),
      velocity: parseFloat((Math.random() * 8 + 1).toFixed(3)),
      heading: parseFloat((Math.random() * 360).toFixed(2)),
      coa_generation_active: Math.random() < 0.35,
      contested_environment: Math.random() < 0.3,
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
      `[Fleet-Source-A] Sent ${event.event_type} from ${event.source_id} for ${event.object_id} → ${res.status}`
    );
  } catch (err) {
    console.error(`[Fleet-Source-A] Connection error: ${err.message}. Will retry…`);
  }
}

let timer = null;

export function start() {
  console.log(
    `[Fleet-Source-A] Starting — target ${INGESTION_URL}, interval ${INTERVAL}ms`
  );
  timer = setInterval(() => sendEvent(generateEvent()), INTERVAL);
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Fleet-Source-A] Stopped");
  }
}

// Allow running standalone: node source-a.js
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start();
}
