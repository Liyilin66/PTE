import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import questionsHandler from "./api/questions.js";
import scoreHandler from "./api/score.js";
import paymentCreateHandler from "./api/payment-create.js";
import paymentWebhookHandler from "./api/payment-webhook.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.options("/api/score", scoreHandler);
app.post("/api/score", scoreHandler);
app.get("/api/questions", questionsHandler);
app.get("/api/questions/:type", questionsHandler);
app.post("/api/payment/create", paymentCreateHandler);
app.post("/api/payment/webhook", paymentWebhookHandler);

const port = 3000;
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
