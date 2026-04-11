import express from "express";
import cors from "cors";
import { analyzeEvent, getAnalyticsResults, getAuditLogs } from "./logic.js";

const PORT = parseInt(process.env.PORT ?? "3004", 10);

const app = express();
app.use(cors());
app.use(express.json());

// --- routes -----------------------------------------------------------------

app.post("/api/analyze", (req, res) => {
  const event = req.body;

  if (!event || typeof event !== "object" || !event.event_id) {
    return res.status(400).json({ error: "Invalid event payload" });
  }

  if (event.status !== "verified") {
    return res
      .status(403)
      .json({ error: "Only verified events are accepted", status: event.status });
  }

  const result = analyzeEvent(event);
  return res.status(200).json(result);
});

app.get("/api/results", (_req, res) => {
  res.json(getAnalyticsResults());
});

app.get("/api/audit", (_req, res) => {
  res.json(getAuditLogs());
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "analytics" });
});

// --- start ------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Analytics service listening on port ${PORT}`);
});

export default server;
