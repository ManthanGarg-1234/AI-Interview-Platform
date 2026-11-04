"use strict";

require("dotenv").config?.();
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan(process.env.NODE_ENV === "test" ? "tiny" : "combined"));
app.use(cookieParser());
app.use(express.json({ limit: "128kb" }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "x-csrf-token"],
}));
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
  if (req.get("origin") === origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-headers", "content-type,x-csrf-token");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api/v1", require("./api"));
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.use((error, _req, res, _next) => {
  const databaseUnavailable = ["DATABASE_NOT_CONFIGURED", "P1001", "P2024"].includes(error.code);
  const codingUnavailable = ["CODING_QUEUE_UNAVAILABLE", "JUDGE0_UNAVAILABLE", "JUDGE0_CONFIGURATION_INVALID"].includes(error.code);
  const status = Number.isInteger(error.status) ? error.status : error.code === "LIMIT_FILE_SIZE" ? 413 : databaseUnavailable || codingUnavailable ? 503 : error.name === "ZodError" ? 400 : 500;
  const message = databaseUnavailable ? "The database service is unavailable. Start PostgreSQL and verify DATABASE_URL before using this feature." : codingUnavailable ? "Coding execution is unavailable. Configure Redis and Judge0 before using this feature." : status >= 500 ? "Unexpected server error." : error.message;
  res.status(status).json({ error: { code: error.code || "REQUEST_FAILED", message, ...(error.name === "ZodError" ? { details: error.issues } : {}) } });
});

if (require.main === module) app.listen(Number(process.env.PORT || 3000), () => console.log(`Coding API listening on ${process.env.PORT || 3000}`));
module.exports = app;
