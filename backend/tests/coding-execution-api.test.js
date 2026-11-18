"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const queue = require("../coding-queue");
const jdoodle = require("../jdoodle");
const prismaModule = require("../prisma");

const problemId = "29ca3668-65b3-490e-b0ae-37d4ff6c3437";
const runId = "39ca3668-65b3-490e-b0ae-37d4ff6c3437";
const submissionId = "49ca3668-65b3-490e-b0ae-37d4ff6c3437";
const queued = [];
let prisma;
let createdSubmissions;
let existingSubmission;
let simulateUniqueConflict;
let simulateUniqueConflictInsert;
let queueFailure;
let queueHealth = { redis: "ready", workerCount: 1 };
let jdoodleHealth = {
  status: "ready",
  configured: true,
  usage: { used: 0, dailyLimit: 20, remaining: 20 },
};

const originalGetPrisma = prismaModule.getPrisma;
const originalEnqueueRun = queue.enqueueCodingRun;
const originalEnqueueSubmission = queue.enqueueCodingSubmission;
const originalDiagnoseQueue = queue.diagnoseCodingQueue;
const originalAssertWorker = queue.assertCodingWorkerAvailable;
const originalDiagnoseJDoodle = jdoodle.diagnose;
prismaModule.getPrisma = () => prisma;
queue.enqueueCodingRun = async (id) => queued.push({ kind: "run", id });
queue.enqueueCodingSubmission = async (id) => {
  if (queueFailure) throw queueFailure;
  queued.push({ kind: "submission", id });
};
queue.diagnoseCodingQueue = async () => queueHealth;
queue.assertCodingWorkerAvailable = async () => {};
jdoodle.diagnose = async () => jdoodleHealth;
const coding = require("../coding");

let server;
let origin;

test.before(async () => {
  process.env.JDOODLE_CLIENT_ID = "test-client-id";
  process.env.JDOODLE_CLIENT_SECRET = "test-client-secret";
  queued.length = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { sub: "student-1" };
    next();
  });
  app.get("/coding/execution-health", coding.executionHealth);
  app.post("/coding/runs", coding.createRun);
  app.get("/coding/runs/:id", coding.getRun);
  app.post("/coding/submissions", coding.createSubmission);
  app.get("/coding/submissions", coding.history);
  app.get("/coding/submissions/:id", coding.getSubmission);
  app.use((error, _req, res, _next) =>
    res
      .status(error.status || (error.name === "ZodError" ? 400 : 500))
      .json({ error: { message: error.message, code: error.code } }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  prismaModule.getPrisma = originalGetPrisma;
  queue.enqueueCodingRun = originalEnqueueRun;
  queue.enqueueCodingSubmission = originalEnqueueSubmission;
  queue.diagnoseCodingQueue = originalDiagnoseQueue;
  queue.assertCodingWorkerAvailable = originalAssertWorker;
  jdoodle.diagnose = originalDiagnoseJDoodle;
});

function installPrisma(problemOverrides = {}) {
  queued.length = 0;
  createdSubmissions = [];
  existingSubmission = null;
  simulateUniqueConflict = false;
  simulateUniqueConflictInsert = false;
  queueFailure = null;
  const runs = [];
  const calls = { submissionUpdate: null, executionResult: null };
  const tx = {
    executionResult: {
      create: async ({ data }) => {
        calls.executionResult = data;
      },
    },
    codeSubmission: {
      findUnique: async () => {
        if (simulateUniqueConflict) {
          simulateUniqueConflict = false;
          simulateUniqueConflictInsert = true;
          return null;
        }
        return existingSubmission;
      },
      create: async ({ data }) => {
        if (simulateUniqueConflictInsert) {
          simulateUniqueConflictInsert = false;
          throw Object.assign(new Error("Unique idempotency constraint."), {
            code: "P2002",
          });
        }
        const created = {
          id: submissionId,
          status: data.status,
          verdict: "PENDING",
          ...data,
        };
        createdSubmissions.push(created);
        existingSubmission = created;
        return created;
      },
      updateMany: async ({ data }) => {
        calls.submissionUpdate = data;
        return { count: 1 };
      },
    },
    submissionStatusHistory: { create: async () => ({}) },
    studentProblemProgress: { upsert: async () => ({}) },
  };
  prisma = {
    codingProblem: {
      findFirst: async ({ where }) =>
        where.id === problemId
          ? {
              id: problemId,
              executionMode: "STDIN_STDOUT",
              languageConfigs: [
                {
                  language: where.languageConfigs.some.language,
                  enabled: true,
                },
              ],
              ...problemOverrides,
            }
          : null,
    },
    codeRun: {
      create: async ({ data }) => {
        runs.push({ id: runId, ...data });
        return { id: runId, status: data.status, provider: data.provider };
      },
      update: async () => ({}),
      findFirst: async ({ where }) =>
        where.userId === "student-1"
          ? {
              id: runId,
              status: "COMPLETED",
              verdict: "WRONG_ANSWER",
              provider: "jdoodle",
              executionTimeMs: 42,
              memoryKb: 512,
              stdout: "actual",
              stderr: "",
              compileOutput: "",
              perTestResults: {
                tests: [
                  {
                    sequence: 1,
                    kind: "PUBLIC",
                    input: "public input",
                    expectedOutput: "expected",
                    stdout: "actual",
                    passed: false,
                    verdict: "WRONG_ANSWER",
                  },
                  {
                    sequence: 2,
                    kind: "HIDDEN",
                    input: "hidden input",
                    expectedOutput: "hidden expected",
                    stdout: "hidden actual",
                    passed: false,
                    verdict: "WRONG_ANSWER",
                  },
                ],
                totalTests: 1,
                executedTests: 1,
                passedTests: 0,
                failedTests: 1,
              },
            }
          : null,
    },
    codeSubmission: {
      findUnique: async () => existingSubmission,
      findFirst: async ({ where }) =>
        where.userId === "student-1"
          ? {
              id: submissionId,
              language: "Java",
              status: "WRONG_ANSWER",
              verdict: "WRONG_ANSWER",
              attemptCount: 1,
              executionResults: [
                {
                  id: "result-1",
                  provider: "jdoodle",
                  passedTests: 1,
                  totalTests: 2,
                  executionTimeMs: 21,
                  memoryKb: 2048,
                  perTestSummary: {
                    evaluatedTests: 2,
                    score: 50,
                    tests: [
                      {
                        sequence: 1,
                        kind: "PUBLIC",
                        passed: true,
                        verdict: "ACCEPTED",
                        stdout: "public result",
                        expected: "not returned",
                      },
                      {
                        sequence: 2,
                        kind: "HIDDEN",
                        passed: false,
                        verdict: "WRONG_ANSWER",
                        input: "private input",
                        expected: "private expected",
                        stdout: "private output",
                      },
                    ],
                  },
                },
              ],
              problem: { title: "Example", slug: "example" },
            }
          : null,
      count: async ({ where }) => {
        assert.equal(where.userId, "student-1");
        return 1;
      },
      findMany: async ({ where }) => {
        assert.equal(where.userId, "student-1");
        assert.equal(where.problemId, problemId);
        return [
          {
            id: submissionId,
            language: "Java",
            status: "ACCEPTED",
            verdict: "ACCEPTED",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            completedAt: new Date("2026-01-01T00:00:01Z"),
            executionResults: [],
            problem: {
              id: problemId,
              slug: "example",
              title: "Example",
              difficulty: "Easy",
            },
          },
        ];
      },
    },
    $transaction: async (callback) =>
      Array.isArray(callback) ? Promise.all(callback) : callback(tx),
    runs,
    calls,
  };
}

test("execution health reports Redis, JDoodle, and worker availability separately", async () => {
  const response = await fetch(`${origin}/coding/execution-health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      ready: true,
      redis: "ready",
      jdoodle: jdoodleHealth,
      worker: "ready",
    },
  });

  queueHealth = { redis: "unavailable", workerCount: null };
  jdoodleHealth = { status: "not_configured", configured: false };
  const unavailable = await fetch(`${origin}/coding/execution-health`);
  assert.deepEqual((await unavailable.json()).data, {
    ready: false,
    redis: "unavailable",
    jdoodle: { status: "not_configured", configured: false },
    worker: "unavailable",
  });
});

test("Run API persists a run and queues its existing asynchronous execution", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main { public static void main(String[] args) {} }",
      customInput: "1\n",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body.data, {
    id: runId,
    status: "QUEUED",
    provider: "jdoodle",
    message: "Queued for JDoodle execution.",
  });
  assert.deepEqual(queued, [{ kind: "run", id: runId }]);
  assert.equal(prisma.runs[0].customInput, "1\n");
});

test("Run API preserves an explicitly empty custom input", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main {}",
      customInput: "",
    }),
  });
  assert.equal(response.status, 202);
  assert.equal(prisma.runs[0].customInput, "");
});

test("Run API rejects unsupported languages sent directly by a client", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Python",
      sourceCode: "print(1)",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(prisma.runs.length, 0);
  assert.equal(queued.length, 0);
});

test("Run API rejects unsupported function harnesses before creating a run", async () => {
  installPrisma({
    executionMode: "FUNCTION_BASED",
    functionName: "solve",
    parameterDefinitions: [{ name: "value", type: "integer" }],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
    languageConfigs: [
      {
        language: "Java",
        enabled: true,
        functionSignature: "solve(value)",
        harnessTemplate: null,
      },
    ],
  });
  const response = await fetch(`${origin}/coding/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main {}",
    }),
  });

  assert.equal(response.status, 422);
  assert.equal(
    (await response.json()).error.code,
    "FUNCTION_HARNESS_UNSUPPORTED",
  );
  assert.equal(prisma.runs.length, 0);
  assert.equal(queued.length, 0);
});

test("Run result endpoint scopes access to its owner and filters hidden test data", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/runs/${runId}`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.perTestResults.totalTests, 1);
  assert.equal(result.data.perTestResults.tests.length, 1);
  assert.deepEqual(result.data.perTestResults.tests[0], {
    sequence: 1,
    kind: "PUBLIC",
    input: "public input",
    expectedOutput: "expected",
    stdout: "actual",
    passed: false,
    verdict: "WRONG_ANSWER",
  });
  assert.doesNotMatch(JSON.stringify(result), /hidden/);

  prisma.codeRun.findFirst = async () => null;
  const unauthorized = await fetch(`${origin}/coding/runs/${runId}`);
  assert.equal(unauthorized.status, 404);
});

test("Submit API preserves the asynchronous submission and evaluation queue", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main {}",
      idempotencyKey: "test-request-123",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body.data, {
    id: submissionId,
    status: "QUEUED",
    verdict: "PENDING",
  });
  assert.deepEqual(queued, [{ kind: "submission", id: submissionId }]);
});

test("Submit API validates function harness configuration before persisting a submission", async () => {
  installPrisma({
    executionMode: "FUNCTION_BASED",
    functionName: "solve",
    parameterDefinitions: [{ name: "value", type: "integer" }],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
    languageConfigs: [
      {
        language: "Java",
        enabled: true,
        functionSignature: "solve(value)",
        harnessTemplate: null,
      },
    ],
  });
  const response = await fetch(`${origin}/coding/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main {}",
    }),
  });
  assert.equal(response.status, 422);
  assert.equal(
    (await response.json()).error.code,
    "FUNCTION_HARNESS_UNSUPPORTED",
  );
  assert.equal(createdSubmissions.length, 0);
  assert.equal(queued.length, 0);
});

test("Submit API deduplicates retries by key and rejects key reuse with different code", async () => {
  installPrisma();
  const body = {
    problemId,
    language: "Java",
    sourceCode: "class Main {}",
    idempotencyKey: "stable-key-123",
  };
  const request = () =>
    fetch(`${origin}/coding/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await request()).status, 202);
  assert.equal((await request()).status, 202);
  assert.equal(createdSubmissions.length, 1);
  body.sourceCode = "print('different')";
  const conflict = await request();
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(createdSubmissions.length, 1);
});

test("Submit API recovers a concurrent idempotency-key insert race", async () => {
  installPrisma();
  const sourceCode = "print('same request')";
  existingSubmission = {
    id: submissionId,
    userId: "student-1",
    problemId,
    language: "Java",
    sourceHash: require("node:crypto")
      .createHash("sha256")
      .update(sourceCode)
      .digest("hex"),
    status: "QUEUED",
    verdict: "PENDING",
  };
  simulateUniqueConflict = true;
  const response = await fetch(`${origin}/coding/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode,
      idempotencyKey: "concurrent-key-123",
    }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).data.id, submissionId);
  assert.equal(createdSubmissions.length, 0);
});

test("Submit queue failure is persisted as SYSTEM_ERROR, not an accepted or wrong-answer verdict", async () => {
  installPrisma();
  queueFailure = Object.assign(new Error("Redis unavailable"), {
    code: "CODING_QUEUE_UNAVAILABLE",
  });
  const response = await fetch(`${origin}/coding/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      problemId,
      language: "Java",
      sourceCode: "class Main {}",
    }),
  });
  assert.equal(response.status, 503);
  assert.equal(prisma.calls.submissionUpdate.status, "SYSTEM_ERROR");
  assert.equal(prisma.calls.submissionUpdate.verdict, "SYSTEM_ERROR");
  assert.equal(
    prisma.calls.executionResult.failureCode,
    "CODING_QUEUE_UNAVAILABLE",
  );
});

test("submission detail is owner-scoped and redacts hidden case data", async () => {
  installPrisma();
  const response = await fetch(`${origin}/coding/submissions/${submissionId}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.executionResults[0].score, 50);
  assert.deepEqual(body.data.executionResults[0].perTestSummary, [
    {
      sequence: 1,
      kind: "PUBLIC",
      passed: true,
      verdict: "ACCEPTED",
      stdout: "public result",
    },
    { sequence: 2, kind: "HIDDEN", passed: false, verdict: "WRONG_ANSWER" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(body),
    /private input|private expected|private output|not returned/,
  );

  prisma.codeSubmission.findFirst = async () => null;
  const unauthorized = await fetch(
    `${origin}/coding/submissions/${submissionId}`,
  );
  assert.equal(unauthorized.status, 404);
});

test("submission history supports the owner's latest problem submission lookup", async () => {
  installPrisma();
  const response = await fetch(
    `${origin}/coding/submissions?problemId=${problemId}&pageSize=1`,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.items[0].id, submissionId);
  assert.equal(body.data.items[0].problem.slug, "example");
});
