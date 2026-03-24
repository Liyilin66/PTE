import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import questionsHandler from "./api/questions.js";
import scoreHandler from "./api/score.js";
import userStatusHandler from "./api/user-status.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.options("/api/score", scoreHandler);
app.post("/api/score", scoreHandler);
app.get("/api/questions/:type", questionsHandler);
app.get("/api/user/status", userStatusHandler);

const port = 3000;
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
