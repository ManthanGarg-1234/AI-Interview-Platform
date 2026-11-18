"use strict";

require("dotenv").config?.();
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const http = require("node:http");
const { Server } = require("socket.io");
const { attachSignaling } = require("./webrtc-signaling");

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan(process.env.NODE_ENV === "test" ? "tiny" : "combined"));
app.use(cookieParser());
app.use(express.json({ limit: "128kb" }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-csrf-token"],
  }),
);
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
  if (req.get("origin") === origin)
    res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-headers", "content-type,x-csrf-token");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api/v1", require("./api"));
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.use((error, _req, res, _next) => {
  const databaseUnavailable = [
    "DATABASE_NOT_CONFIGURED",
    "P1000",
    "P1001",
    "P1002",
    "P2024",
  ].includes(error.code);
  const databaseSchemaUnavailable = ["P2021", "P2022"].includes(error.code);
  const codingUnavailable = [
    "CODING_QUEUE_UNAVAILABLE",
    "CODING_QUEUE_CONFIGURATION_INVALID",
    "CODING_REDIS_UNAVAILABLE",
    "CODING_WORKER_UNAVAILABLE",
    "CODING_WORKER_STATUS_UNKNOWN",
    "JDOODLE_UNAVAILABLE",
    "JDOODLE_CONFIGURATION_INVALID",
    "JDOODLE_AUTHENTICATION_FAILED",
    "JDOODLE_CREDITS_EXHAUSTED",
    "JDOODLE_PROVIDER_ERROR",
    "JDOODLE_PROVIDER_UNAVAILABLE",
    "JDOODLE_PROVIDER_RESPONSE_INVALID",
    "JDOODLE_REQUEST_TIMEOUT",
  ].includes(error.code);
  const status = Number.isInteger(error.status)
    ? error.status
    : error.code === "LIMIT_FILE_SIZE"
      ? 413
      : databaseUnavailable || databaseSchemaUnavailable || codingUnavailable
        ? 503
        : error.name === "ZodError"
          ? 400
          : 500;
  const message = databaseUnavailable
    ? "The database service is unavailable. Start PostgreSQL and verify DATABASE_URL before using this feature."
    : databaseSchemaUnavailable
      ? "The database schema is missing required tables or columns. Apply reviewed schema migrations before using this feature."
      : codingUnavailable
        ? error.code === "CODING_WORKER_UNAVAILABLE"
          ? "Coding execution is unavailable because no BullMQ coding worker is connected."
          : error.code === "CODING_REDIS_UNAVAILABLE" ||
              error.code === "CODING_QUEUE_UNAVAILABLE"
            ? "Coding execution is unavailable because the Redis queue cannot be reached."
            : error.code === "JDOODLE_UNAVAILABLE"
              ? "Coding execution is unavailable because JDoodle credentials are not configured."
              : error.code === "JDOODLE_AUTHENTICATION_FAILED"
                ? "Coding execution is unavailable because JDoodle rejected its configured credentials."
                : error.code === "JDOODLE_CREDITS_EXHAUSTED"
                  ? "Coding execution is unavailable because the JDoodle daily credit allowance is exhausted."
                  : error.code === "JDOODLE_CONFIGURATION_INVALID" ||
                      error.code === "CODING_QUEUE_CONFIGURATION_INVALID"
                    ? "Coding execution has an invalid Redis or JDoodle configuration."
                    : "Coding execution is temporarily unavailable."
        : status >= 500
          ? "Unexpected server error."
          : error.message;
  if (status >= 500)
    console.error("API request failed.", {
      method: _req.method,
      path: _req.path,
      code: error.code || "UNCLASSIFIED",
      name: error.name,
    });
  res
    .status(status)
    .json({
      error: {
        code: error.code || "REQUEST_FAILED",
        message,
        ...(error.name === "ZodError" ? { details: error.issues } : {}),
      },
    });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  },
  maxHttpBufferSize: 256 * 1024,
});
attachSignaling(io);
if (require.main === module)
  httpServer.listen(Number(process.env.PORT || 3000), () =>
    console.log(`Coding API listening on ${process.env.PORT || 3000}`),
  );
module.exports = app;
