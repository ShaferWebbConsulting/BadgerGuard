import express from "express";
import cors from "cors";
import {
  validateEvent,
  normalize,
  ingest,
  getEvents,
  getAuditLogs,
} from "./logic.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const FUSION_URL =
  process.env.FUSION_URL ?? "http://fusion:3002/api/fuse";

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --------------- Routes ---------------

app.post("/api/events", async (req, res) => {
  const { valid, errors } = validateEvent(req.body);
  if (!valid) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const normalized = normalize(req.body);
  const { event } = ingest(normalized);

  // Best-effort forward to fusion service
  try {
    await fetch(FUSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Fusion service unavailable — not a hard failure
  }

  return res.status(201).json(event);
});

app.get("/api/events", (_req, res) => {
  const limit = parseInt(_req.query.limit, 10) || 0;
  return res.json(getEvents(limit));
});

app.get("/api/audit", (_req, res) => {
  return res.json(getAuditLogs());
});

app.get("/api/health", (_req, res) => {
  return res.json({ status: "ok", service: "ingestion" });
});

// --------------- Start ---------------

const server = app.listen(PORT, () => {
  console.log(`Ingestion service listening on port ${PORT}`);
});

export default server;
