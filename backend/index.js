"use strict";

require("dotenv").config?.();
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const http = require("node:http");
const { Server } = require("socket.io");
const { attachSignaling } = require("./webrtc-signaling");
const { validateEnv } = require("./config/env");

const app = express();
const frontendOrigin = new URL(process.env.FRONTEND_ORIGIN || "http://localhost:5173").origin;
morgan.token("safe-url", (req) => {
  const url = req.originalUrl || req.url;
  return url.startsWith("/api/v1/auth/google/callback?") ? "/api/v1/auth/google/callback" : url;
});
morgan.format("career", "[:date[clf]] \":method :safe-url HTTP/:http-version\" :status :res[content-length] \":referrer\"");
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan(process.env.NODE_ENV === "test" ? ":method :safe-url :status :res[content-length] - :response-time ms" : "career"));
app.use(cookieParser());
app.use(express.json({ limit: "128kb" }));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const origin = req.get("origin");
  const isGoogleOAuthCallback = req.method === "GET" && req.path === "/api/v1/auth/google/callback";
  if (origin && origin !== frontendOrigin && !isGoogleOAuthCallback) {
    return res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." } });
  }
  next();
});
app.use(cors({
  origin: frontendOrigin,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "x-csrf-token"],
}));

app.use("/api/v1", require("./api"));
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.use((req, res) => res.status(404).json({
  error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} was not found.` },
}));
app.use((error, _req, res, _next) => {
  const databaseUnavailable = ["DATABASE_NOT_CONFIGURED", "P1001", "P2024"].includes(error.code);
  const codingUnavailable = ["CODING_QUEUE_UNAVAILABLE", "JUDGE0_UNAVAILABLE", "JUDGE0_CONFIGURATION_INVALID"].includes(error.code);
  const authRateLimitUnavailable = error.code === "AUTH_RATE_LIMIT_UNAVAILABLE";
  const emailUnavailable = ["EMAIL_PROVIDER_NOT_CONFIGURED", "EMAIL_PROVIDER_FAILED"].includes(error.code);
  const googleOAuthUnavailable = ["GOOGLE_OAUTH_NOT_CONFIGURED", "GOOGLE_OAUTH_UNAVAILABLE"].includes(error.code);
  const firebaseAuthUnavailable = ["FIREBASE_AUTH_NOT_CONFIGURED", "INVALID_FIREBASE_TOKEN"].includes(error.code);
  const status = Number.isInteger(error.status) ? error.status : error.code === "LIMIT_FILE_SIZE" ? 413 : databaseUnavailable || codingUnavailable || authRateLimitUnavailable || emailUnavailable || googleOAuthUnavailable ? 503 : firebaseAuthUnavailable && error.code === "FIREBASE_AUTH_NOT_CONFIGURED" ? 503 : error.name === "ZodError" ? 400 : 500;
  const message = databaseUnavailable ? "The database service is unavailable. Start PostgreSQL and verify DATABASE_URL before using this feature." : codingUnavailable ? "Coding execution is unavailable. Configure Redis and Judge0 before using this feature." : authRateLimitUnavailable ? "Authentication is temporarily unavailable." : emailUnavailable ? "Email delivery is unavailable. Try again later." : googleOAuthUnavailable ? "Google sign-in is unavailable. Configure the Google OAuth client to enable it." : firebaseAuthUnavailable && error.code === "FIREBASE_AUTH_NOT_CONFIGURED" ? "Firebase Google sign-in is not configured." : status >= 500 ? "Unexpected server error." : error.message;
  const details = error.name === "ZodError"
    ? error.issues.map((issue) => ({ code: issue.code, path: issue.path.join("."), message: issue.message }))
    : undefined;
  res.status(status).json({ error: { code: error.code || "REQUEST_FAILED", message, ...(details ? { details } : {}) } });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: frontendOrigin, credentials: true },
  maxHttpBufferSize: 256 * 1024,
});
attachSignaling(io);
if (require.main === module) {
  try {
    const config = validateEnv();
    httpServer.listen(config.PORT, () => console.log(`CareerPrepAI API listening on port ${config.PORT}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = app;
