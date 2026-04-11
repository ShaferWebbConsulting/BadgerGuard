import express from "express";
import cors from "cors";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const INGESTION_HOST = process.env.INGESTION_HOST || "localhost";
const FUSION_HOST = process.env.FUSION_HOST || "localhost";
const VALIDATION_HOST = process.env.VALIDATION_HOST || "localhost";
const ANALYTICS_HOST = process.env.ANALYTICS_HOST || "localhost";

const serviceMap = {
  ingestion: { host: INGESTION_HOST, port: 3001 },
  fusion: { host: FUSION_HOST, port: 3002 },
  validation: { host: VALIDATION_HOST, port: 3003 },
  analytics: { host: ANALYTICS_HOST, port: 3004 },
};

app.use(cors());

app.use(express.static(path.join(__dirname, "public")));

// Proxy /api/<service>/* to the corresponding backend service
app.use("/api/:service", (req, res) => {
  const service = serviceMap[req.params.service];
  if (!service) {
    res.status(404).json({ error: `Unknown service: ${req.params.service}` });
    return;
  }

  const targetPath = `/api${req.url}`;
  const options = {
    hostname: service.host,
    port: service.port,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `${service.host}:${service.port}` },
    timeout: 5000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(503).json({
        error: `Service '${req.params.service}' timed out`,
      });
    }
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(503).json({
        error: `Service '${req.params.service}' unavailable: ${err.message}`,
      });
    }
  });

  req.pipe(proxyReq, { end: true });
});

app.listen(PORT, () => {
  console.log(`TFG Dashboard running on http://localhost:${PORT}`);
  console.log("Service targets:", JSON.stringify(serviceMap, null, 2));
});
