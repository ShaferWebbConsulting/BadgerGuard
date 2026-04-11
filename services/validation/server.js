import express from "express";
import cors from "cors";
import { validateEvent, getValidationResults, getAuditLogs } from "./logic.js";

const PORT = parseInt(process.env.PORT ?? "3003", 10);
const ANALYTICS_URL =
  process.env.ANALYTICS_URL ?? "http://analytics:3004/api/analyze";

const app = express();
app.use(cors());
app.use(express.json());

// --- routes -----------------------------------------------------------------

app.post("/api/validate", async (req, res) => {
  const fusedEvent = req.body;

  if (!fusedEvent || typeof fusedEvent !== "object" || !fusedEvent.event_id) {
    return res.status(400).json({ error: "Invalid fused event payload" });
  }

  const result = await validateEvent(fusedEvent);

  // Forward verified events to analytics (best-effort)
  if (result.status === "verified") {
    const verifiedEvent = { ...fusedEvent, status: "verified" };
    try {
      await fetch(ANALYTICS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifiedEvent),
      });
    } catch {
      // Analytics service unavailable — continue
    }
  }

  const statusCode = result.status === "verified" ? 200 : 200;
  return res.status(statusCode).json(result);
});

app.get("/api/validations", (_req, res) => {
  res.json(getValidationResults());
});

app.get("/api/audit", (_req, res) => {
  res.json(getAuditLogs());
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "validation" });
});

// --- start ------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Validation service listening on port ${PORT}`);
});

export default server;
