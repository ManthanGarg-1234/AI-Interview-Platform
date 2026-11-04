"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const storage = require("../private-storage");
const { executeSubmission } = require("../coding-worker");

let server;
let origin;
const storedKeys = [];

function fakePrisma(expected, testCases = [
  { sequence: 1, kind: "PUBLIC", enabled: true, inputRef: storedKeys[0], expectedOutputRef: expected },
  { sequence: 2, kind: "HIDDEN", enabled: true, inputRef: storedKeys[1], expectedOutputRef: expected },
]) {
  const calls = { statuses: [], result: null, progress: false };
  const submission = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    problemId: crypto.randomUUID(),
    language: "Python",
    sourceCode: "print('ok')",
    status: "QUEUED",
    problem: {
      timeLimitMs: 2_000,
      memoryLimitKb: 262_144,
      testCases: testCases.filter((testCase) => testCase.enabled),
    },
  };
  const tx = {
    executionResult: { create: async ({ data }) => { calls.result = data; } },
    codeSubmission: { update: async () => {}, findUnique: async () => ({ status: "RUNNING" }) },
    submissionStatusHistory: { create: async ({ data }) => calls.statuses.push(data) },
    studentProblemProgress: { update: async () => { calls.progress = true; } },
  };
  return {
    calls,
    codeSubmission: { ...tx.codeSubmission, findUnique: async () => submission },
    submissionStatusHistory: tx.submissionStatusHistory,
    $transaction: async (callback) => callback(tx),
  };
}

test.before(async () => {
  process.env.JUDGE0_URL = "";
  process.env.JUDGE0_JAVA_ID = "1";
  process.env.JUDGE0_CPP_ID = "2";
  process.env.JUDGE0_PYTHON_ID = "3";
  process.env.JUDGE0_JAVASCRIPT_ID = "4";
  process.env.JUDGE0_BASE64 = "true";
  process.env.JUDGE0_POLL_INTERVAL_MS = "100";
  process.env.JUDGE0_MAX_POLL_ATTEMPTS = "2";
  const inputOne = `worker-${crypto.randomUUID()}-one`;
  const inputTwo = `worker-${crypto.randomUUID()}-two`;
  const output = "ok\n";
  for (const [key, value] of [["input-one", inputOne], ["input-two", inputTwo], ["output", output]]) {
    const stored = await storage.put(`tests/${crypto.randomUUID()}-${key}`, Buffer.from(value));
    storedKeys.push(stored.key);
  }
  server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url.startsWith("/submissions?")) return response.end(JSON.stringify({ token: crypto.randomUUID() }));
    return response.end(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from("ok\n").toString("base64"), time: "0.001", memory: 1024 }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  process.env.JUDGE0_URL = origin;
});

test.after(async () => {
  await Promise.all(storedKeys.map((key) => storage.remove(key)));
  await new Promise((resolve) => server.close(resolve));
});

test("worker accepts all tests and stores no hidden inputs or expected output", async () => {
  const prisma = fakePrisma(storedKeys[2]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 2);
  assert.equal(prisma.calls.result.totalTests, 2);
  assert.equal(prisma.calls.result.perTestSummary.tests.length, 2);
  assert.ok(prisma.calls.progress);
  assert.doesNotMatch(JSON.stringify(prisma.calls.result.perTestSummary), /worker-/);
});

test("zero enabled tests fail safely without solving progress", async () => {
  const prisma = fakePrisma(storedKeys[2], []);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 0);
  assert.equal(prisma.calls.result.failureCode, "NO_ENABLED_TEST_CASES");
  assert.equal(prisma.calls.progress, false);
});

test("all disabled tests fail safely without solving progress", async () => {
  const prisma = fakePrisma(storedKeys[2], [{ sequence: 1, kind: "PUBLIC", enabled: false, inputRef: storedKeys[0], expectedOutputRef: storedKeys[2] }]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 0);
  assert.equal(prisma.calls.result.failureCode, "NO_ENABLED_TEST_CASES");
  assert.equal(prisma.calls.progress, false);
});

test("missing test-case storage fails safely with no executed tests", async () => {
  const prisma = fakePrisma("tests/missing-expected-output", [
    { sequence: 1, kind: "PUBLIC", enabled: true, inputRef: storedKeys[0], expectedOutputRef: "tests/missing-expected-output" },
  ]);
  await assert.rejects(() => executeSubmission(prisma, "submission-id"), { code: "TEST_CASE_STORAGE_UNAVAILABLE" });
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 1);
  assert.equal(prisma.calls.result.failureCode, "TEST_CASE_STORAGE_UNAVAILABLE");
  assert.equal(prisma.calls.progress, false);
});

test("worker records a wrong answer and does not mark progress solved", async () => {
  const wrongOutput = await storage.put(`tests/${crypto.randomUUID()}-wrong-output`, Buffer.from("wrong\n"));
  const prisma = fakePrisma(wrongOutput.key);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.failureCode, "WRONG_ANSWER");
  assert.equal(prisma.calls.progress, false);
  await storage.remove(wrongOutput.key);
});
