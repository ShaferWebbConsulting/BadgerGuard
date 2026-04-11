import express from "express";
import cors from "cors";
import {
  addEvent,
  getFusedEvents,
  getAuditLogs,
  cleanExpired,
} from "./logic.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const VALIDATION_URL =
  process.env.VALIDATION_URL ?? "http://validation:3003/api/validate";

const app = express();
app.use(cors());
app.use(express.json());

// Periodically clean expired buffered events (every 5 s)
const CLEAN_INTERVAL = 5_000;
const cleanTimer = setInterval(cleanExpired, CLEAN_INTERVAL);
cleanTimer.unref();

// --- routes -----------------------------------------------------------------

app.post("/api/fuse", async (req, res) => {
  const event = req.body;

  if (!event || typeof event !== "object" || !event.event_id) {
    return res.status(400).json({ error: "Invalid event payload" });
  }

  const result = addEvent(event);

  if (result.fused) {
    // Best-effort forward to validation service
    try {
      await fetch(VALIDATION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.fused),
      });
    } catch {
      // Validation service unavailable — continue
    }

    return res.status(201).json({
      status: "fused",
      fused_event: result.fused,
      audit: result.audit,
    });
  }

  return res.status(202).json({
    status: "buffered",
    message: "Event buffered, awaiting matching sources",
    audit: result.audit,
  });
});

app.get("/api/fused-events", (_req, res) => {
  const limit = parseInt(_req.query.limit ?? "0", 10);
  res.json(getFusedEvents(limit));
});

app.get("/api/audit", (_req, res) => {
  res.json(getAuditLogs());
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "fusion" });
});

// --- start ------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Fusion service listening on port ${PORT}`);
});

export default server;
