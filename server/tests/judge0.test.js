"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const judge0 = require("../judge0");

let server;
let origin;
let requests;

test.before(async () => {
  process.env.JUDGE0_JAVA_ID = "101";
  process.env.JUDGE0_CPP_ID = "102";
  process.env.JUDGE0_PYTHON_ID = "103";
  process.env.JUDGE0_JAVASCRIPT_ID = "104";
  process.env.JUDGE0_BASE64 = "true";
  server = http.createServer((request, response) => {
    requests.push(request.url);
    response.setHeader("content-type", "application/json");
    if (request.url.startsWith("/submissions?")) return response.end(JSON.stringify({ token: "test-token" }));
    if (request.url.includes("test-token")) return response.end(JSON.stringify({ status: { id: 3 }, stdout: Buffer.from("ok\n").toString("base64"), time: "0.01", memory: 2048 }));
    response.statusCode = 500;
    return response.end(JSON.stringify({ error: "provider failure" }));
  });
  requests = [];
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  process.env.JUDGE0_URL = origin;
  process.env.JUDGE0_POLL_INTERVAL_MS = "100";
  process.env.JUDGE0_MAX_POLL_ATTEMPTS = "2";
});

test.after(() => server.close());

test("language mapping is explicit and Judge0 tokens are polled", async () => {
  const config = judge0.configuration();
  assert.deepEqual(config.languageIds, { Java: 101, "C++": 102, Python: 103, JavaScript: 104 });
  const result = await judge0.submitAndPoll({ language: "Python", sourceCode: "print('ok')", stdin: "", cpuTimeLimitMs: 2000, memoryLimitKb: 262144 });
  assert.equal(result.verdict, "ACCEPTED");
  assert.equal(result.stdout, "ok\n");
  assert.equal(result.executionTimeMs, 10);
  assert.ok(requests.some((url) => url.includes("test-token")));
});

test("invalid language configuration and provider failures are explicit", async () => {
  const saved = process.env.JUDGE0_PYTHON_ID;
  delete process.env.JUDGE0_PYTHON_ID;
  assert.throws(() => judge0.configuration(), /JUDGE0_PYTHON_ID/);
  process.env.JUDGE0_PYTHON_ID = saved;
  process.env.JUDGE0_URL = `${origin}/failure`;
  await assert.rejects(() => judge0.submitAndPoll({ language: "Java", sourceCode: "x", stdin: "", cpuTimeLimitMs: 100, memoryLimitKb: 1 }), (error) => error.code === "JUDGE0_PROVIDER_ERROR");
  process.env.JUDGE0_URL = origin;
});

test("base64 helpers and terminal verdict mapping are deterministic", () => {
  assert.equal(judge0.decode(judge0.encode("hello", true), true), "hello");
  assert.equal(judge0.statusToVerdict(4), "WRONG_ANSWER");
  assert.equal(judge0.statusToVerdict(5), "TIME_LIMIT_EXCEEDED");
  assert.equal(judge0.statusToVerdict(6), "COMPILATION_ERROR");
});
