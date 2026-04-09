import "dotenv/config";
import cors from "cors";
import express from "express";

import questionsHandler from "./api/questions.js";
import scoreHandler from "./api/score.js";
import paymentCreateHandler from "./api/payment-create.js";
import paymentWebhookHandler from "./api/payment-webhook.js";
import llmHealthHandler from "./api/debug/llm-health.js";
import clientFetchDebugHandler from "./api/debug/client-fetch.js";
import postProbeDebugHandler from "./api/debug/post-probe.js";

const app = express();

app.use(cors());
app.use(express.json());

app.options("/api/score", scoreHandler);
app.post("/api/score", scoreHandler);
app.get("/api/debug/llm-health", llmHealthHandler);
app.options("/api/debug/client-fetch", clientFetchDebugHandler);
app.get("/api/debug/client-fetch", clientFetchDebugHandler);
app.options("/api/debug/post-probe", postProbeDebugHandler);
app.post("/api/debug/post-probe", postProbeDebugHandler);
app.get("/api/questions", questionsHandler);
app.get("/api/questions/:type", questionsHandler);
app.post("/api/payment/create", paymentCreateHandler);
app.post("/api/payment/webhook", paymentWebhookHandler);

const defaultPort = 3000;
const requestedPort = Number(process.env.PORT || process.env.API_PORT || defaultPort);
const port = Number.isFinite(requestedPort) && requestedPort > 0 ? Math.floor(requestedPort) : defaultPort;

const server = app.listen(port, () => {
  console.log(`[api] server running at http://localhost:${port}`);
  console.log("[api] ready route: POST /api/score");
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`[api] port ${port} is already in use. Set API_PORT to another value (for example 3001).`);
  } else {
    console.error("[api] server startup failed:", error);
  }
  process.exit(1);
});
