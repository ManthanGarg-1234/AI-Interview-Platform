"use strict";

require("dotenv").config?.();
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const crypto = require("node:crypto");
const { listProblems, getProblem } = require("./problems");
const storage = require("./storage");
const { requireUser, rateLimit } = require("./middleware");
const { createJavaSubmission } = require("./judge0");
const { createLocalSubmission } = require("./local-java");

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
  allowedHeaders: ["content-type", "x-csrf-token", "x-demo-user-id"],
}));
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
  if (req.get("origin") === origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-headers", "content-type,x-csrf-token,x-demo-user-id");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const localRunnerEnabled = process.env.LOCAL_JAVA_RUNNER !== "false" && !process.env.JUDGE0_URL;
app.use("/api/v1", require("./api"));
app.get("/api/health", (_req, res) => res.json({ ok: true, judgeConfigured: Boolean(process.env.JUDGE0_URL), localRunnerEnabled }));
app.get("/api/problems", (req, res) => res.json({ data: listProblems(req.query).map(({ hiddenTests, ...problem }) => problem) }));
app.get("/api/problems/:id", (req, res) => {
  const problem = getProblem(req.params.id);
  if (!problem) return res.status(404).json({ error: "Problem not found." });
  const { hiddenTests, ...safeProblem } = problem;
  res.json({ data: safeProblem });
});
app.use("/api", requireUser, rateLimit(60000, 120));
app.get("/api/users/me/submissions", (req, res) => res.json({ data: storage.list(req.user.id) }));
app.get("/api/submissions/:id", (req, res) => {
  const submission = storage.find(req.params.id, req.user.id);
  if (!submission) return res.status(404).json({ error: "Submission not found." });
  res.json({ data: submission });
});
async function submit(req, res, mode) {
  const { problemId, sourceCode, input, idempotencyKey } = req.body || {};
  const problem = getProblem(problemId);
  if (!problem || typeof sourceCode !== "string" || sourceCode.length < 1 || sourceCode.length > 50000) return res.status(400).json({ error: "A published problem and source code up to 50 KB are required." });
  if (mode === "run" && typeof input === "string" && input.length > 10000) return res.status(400).json({ error: "Custom input is limited to 10 KB." });
  const existing = idempotencyKey && storage.list(req.user.id).find((record) => record.idempotencyKey === idempotencyKey);
  if (existing) return res.status(200).json({ data: existing });
  const record = { id: crypto.randomUUID(), idempotencyKey: idempotencyKey || null, userId: req.user.id, problemId, language: "Java", type: mode, status: "Processing", verdict: "Pending", createdAt: new Date().toISOString() };
  storage.add(record);
  try {
    const tests = mode === "run" ? [{ input: input || problem.publicTests[0].input, output: problem.publicTests[0].output }] : problem.hiddenTests;
    let result = { verdict: "Accepted", passedTests: 0, totalTests: tests.length, executionTimeMs: null };
    for (const test of tests) {
      const judged = process.env.JUDGE0_URL
        ? await createJavaSubmission(sourceCode, test.input, test.output)
        : localRunnerEnabled
          ? await createLocalSubmission(sourceCode, test.input, test.output, problem.timeLimitMs)
          : (() => { throw Object.assign(new Error("A Judge0 execution service is not configured."), { code: "JUDGE_UNAVAILABLE" }); })();
      result.executionTimeMs = judged.time ? Number(judged.time) * 1000 : null;
      if (judged.status && judged.status.id !== 3) { result.verdict = judged.status.description || "Execution Error"; result.errorSummary = String(judged.stderr || judged.compile_output || "").slice(0, 1000); break; }
      result.passedTests += 1;
    }
    Object.assign(record, result, { status: "Completed", completedAt: new Date().toISOString() });
  } catch (error) {
    Object.assign(record, { status: "Completed", verdict: error.code === "JUDGE_UNAVAILABLE" ? "Internal Judge Error" : "Execution Error", errorSummary: error.message });
  }
  storage.update(record.id, req.user.id, record);
  res.status(201).json({ data: record });
}
app.post("/api/submissions/run", (req, res) => submit(req, res, "run"));
app.post("/api/submissions/submit", (req, res) => submit(req, res, "submit"));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : error.name === "ZodError" ? 400 : 500;
  const message = status >= 500 ? "Unexpected server error." : error.message;
  res.status(status).json({ error: { code: error.code || "REQUEST_FAILED", message, ...(error.name === "ZodError" ? { details: error.issues } : {}) } });
});

if (require.main === module) app.listen(Number(process.env.PORT || 3000), () => console.log(`Coding API listening on ${process.env.PORT || 3000}`));
module.exports = app;
