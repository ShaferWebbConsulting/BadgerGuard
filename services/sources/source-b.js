const INGESTION_URL = process.env.INGESTION_URL || "http://localhost:3001/api/events";
const INTERVAL = parseInt(process.env.INTERVAL, 10) || 4000;

const OBJECT_IDS = ["OBJ-001", "OBJ-002", "OBJ-003", "OBJ-004", "OBJ-005"];
const PLATFORM_IDS = [
  "escort-drone",
  "autonomous-strike-platform",
  "logistics-uav",
];
const EVENT_TYPES = ["coordination", "fault_event", "runtime_alert"];
const RUNTIME_FAULT_THRESHOLD = 0.15; // Elevated runtime fault signal rate for contested mission simulation

const MISSION_SCENARIOS = [
  "contested airspace",
  "degraded communications",
  "conflicting task allocation",
  "unsafe flight path generation",
  "mission replanning",
  "fleet coordination failures",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let eventCount = 0;

function generateEvent() {
  eventCount++;

  const reading = parseFloat((Math.random() * 1000).toFixed(2));
  const threshold = parseFloat((Math.random() * 500 + 250).toFixed(2));
  const runtimeFaultDetected = Math.random() < RUNTIME_FAULT_THRESHOLD;

  const payload = {
    mission_scenario: randomFrom(MISSION_SCENARIOS),
    sensor_type: randomFrom(["infrared", "radar", "optical"]),
    reading,
    threshold,
    runtime_fault_detected: runtimeFaultDetected,
    anomaly_detected: runtimeFaultDetected,
    coordination_integrity: parseFloat(Math.random().toFixed(2)),
  };

  // Every 10th event, simulate a runtime autonomy fault
  if (eventCount % 10 === 0) {
    payload.corrupted = true;
    payload.runtime_fault = randomFrom([
      "unsafe route detected",
      "mission conflict identified",
      "deconfliction failure",
      "fleet synchronization degraded",
      "communications disruption",
      "mission reassignment triggered",
    ]);
    console.log(`[Fleet-Source-B] Injecting runtime fault event #${eventCount}`);
  }

  return {
    source_id: randomFrom(PLATFORM_IDS),
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
      `[Fleet-Source-B] Sent ${event.event_type} from ${event.source_id} for ${event.object_id} → ${res.status}`
    );
  } catch (err) {
    console.error(`[Fleet-Source-B] Connection error: ${err.message}. Will retry…`);
  }
}

let timer = null;

export function start() {
  console.log(
    `[Fleet-Source-B] Starting — target ${INGESTION_URL}, interval ${INTERVAL}ms`
  );
  timer = setInterval(() => sendEvent(generateEvent()), INTERVAL);
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Fleet-Source-B] Stopped");
  }
}

// Allow running standalone: node source-b.js
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  start();
}
