"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jdoodle = require("../jdoodle");
const credits = require("../jdoodle-credits");

const originalFetch = global.fetch;
const originalConsoleError = console.error;
const originalEnvironment = Object.fromEntries(
  [
    "JDOODLE_CLIENT_ID",
    "JDOODLE_CLIENT_SECRET",
    "JDOODLE_JAVA_VERSION_INDEX",
    "JDOODLE_REQUEST_TIMEOUT_MS",
    "JDOODLE_DAILY_CREDIT_LIMIT",
  ].map((name) => [name, process.env[name]]),
);
let requests;
let providerLogs;
let mockResponse;

test.beforeEach(() => {
  credits.invalidateUsage();
  process.env.JDOODLE_CLIENT_ID = "test-client-id";
  process.env.JDOODLE_CLIENT_SECRET = "test-client-secret";
  process.env.JDOODLE_JAVA_VERSION_INDEX = "5";
  process.env.JDOODLE_REQUEST_TIMEOUT_MS = "1000";
  process.env.JDOODLE_DAILY_CREDIT_LIMIT = "20";
  requests = [];
  providerLogs = [];
  console.error = (...args) => providerLogs.push(args);
  mockResponse = {
    status: 200,
    creditStatus: 200,
    body: { output: "ok\n", statusCode: 200, memory: "2048", cpuTime: "0.01" },
    used: 0,
  };
  global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    const isCreditRequest = url.endsWith("/credit-spent");
    const error = isCreditRequest
      ? mockResponse.creditError
      : mockResponse.error;
    if (error) throw error;
    const status = isCreditRequest
      ? mockResponse.creditStatus
      : mockResponse.status;
    const body = isCreditRequest
      ? { used: mockResponse.used }
      : mockResponse.body;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
});

test.after(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("executes Java with documented language/version fields and normalized resource metrics", async () => {
  const result = await jdoodle.submitAndPoll({
    language: "Java",
    sourceCode: "class Main {}",
    stdin: "input\n",
    cpuTimeLimitMs: 2000,
    memoryLimitKb: 262144,
  });
  assert.equal(requests.at(-1).url, "https://api.jdoodle.com/v1/execute");
  assert.deepEqual(requests.at(-1).body, {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    script: "class Main {}",
    stdin: "input\n",
    language: "java",
    versionIndex: "5",
  });
  assert.equal(result.verdict, "ACCEPTED");
  assert.equal(result.stdout, "ok\n");
  assert.equal(result.executionTimeMs, 10);
  assert.equal(result.memoryKb, 2048);
});

test("uses compileOnly response status to identify a compilation failure", async () => {
  mockResponse.body = {
    output: "Main.java:1: error: ';' expected",
    statusCode: 200,
    compilationStatus: 1,
  };
  const result = await jdoodle.compile({
    language: "Java",
    sourceCode: "class Main {",
  });
  assert.equal(requests[0].body.compileOnly, true);
  assert.equal(result.compiled, false);
  assert.match(result.output, /error/);
});

test("classifies Java runtime exceptions and timeout output separately from HTTP success", async () => {
  mockResponse.body.output =
    'Exception in thread "main" java.lang.IllegalStateException';
  assert.equal(
    (
      await jdoodle.submitAndPoll({
        language: "Java",
        sourceCode: "class Main {}",
        stdin: "",
      })
    ).verdict,
    "RUNTIME_ERROR",
  );
  mockResponse.body.output = "Execution timed out";
  assert.equal(
    (
      await jdoodle.submitAndPoll({
        language: "Java",
        sourceCode: "class Main {}",
        stdin: "",
      })
    ).verdict,
    "TIME_LIMIT_EXCEEDED",
  );
});

test("maps credential and credit HTTP failures without marking them retryable", async () => {
  for (const [status, code] of [
    [401, "JDOODLE_AUTHENTICATION_FAILED"],
    [429, "JDOODLE_CREDITS_EXHAUSTED"],
    [503, "JDOODLE_PROVIDER_ERROR"],
  ]) {
    mockResponse.status = status;
    mockResponse.body = {
      error: "provider details",
      statusCode: status,
      requestId: `request-${status}`,
    };
    await assert.rejects(
      jdoodle.submitAndPoll({
        language: "Java",
        sourceCode: "class Main {}",
        stdin: "",
      }),
      (error) =>
        error.code === code &&
        error.providerDiagnostics.httpStatus === status &&
        error.providerDiagnostics.jdoodleStatusCode === status &&
        error.providerDiagnostics.providerRequestId === `request-${status}` &&
        error.providerDiagnostics.phase === "execute" &&
        (status === 429
          ? error.retryable === false
          : error.retryable === undefined),
    );
  }
});

test("preserves diagnostics from a 2xx response containing a provider error", async () => {
  mockResponse.body = {
    statusCode: 400,
    error: {
      message: "Unsupported request field",
      referenceId: "jdoodle-reference-42",
    },
  };
  await assert.rejects(
    jdoodle.compile({ language: "Java", sourceCode: "class Main {}" }),
    (error) => {
      assert.equal(error.code, "JDOODLE_REQUEST_REJECTED");
      assert.equal(error.providerDiagnostics.httpStatus, 200);
      assert.equal(error.providerDiagnostics.jdoodleStatusCode, 400);
      assert.equal(error.providerDiagnostics.phase, "compileOnly");
      assert.equal(
        error.providerDiagnostics.providerRequestId,
        "jdoodle-reference-42",
      );
      assert.match(error.safeMessage, /Unsupported request field/);
      return true;
    },
  );
  assert.equal(providerLogs.length, 1);
  assert.deepEqual(providerLogs[0][1], {
    provider: "jdoodle",
    phase: "compileOnly",
    httpStatus: 200,
    jdoodleStatusCode: 400,
    providerRequestId: "jdoodle-reference-42",
    errorMessage: "Unsupported request field",
    code: "JDOODLE_REQUEST_REJECTED",
  });
});

test("preserves HTTP status and provider message from non-2xx responses", async () => {
  mockResponse.status = 400;
  mockResponse.body = { error: "Malformed payload", statusCode: 400 };
  await assert.rejects(
    jdoodle.submitAndPoll({
      language: "Java",
      sourceCode: "class Main {}",
      stdin: "",
    }),
    (error) => {
      assert.equal(error.providerDiagnostics.httpStatus, 400);
      assert.equal(error.providerDiagnostics.jdoodleStatusCode, 400);
      assert.equal(error.providerDiagnostics.phase, "execute");
      assert.match(error.safeMessage, /Malformed payload/);
      return true;
    },
  );
});

test("uses a safe generic message when provider error details are missing", async () => {
  mockResponse.body = { statusCode: 200, error: {} };
  await assert.rejects(
    jdoodle.compile({ language: "Java", sourceCode: "class Main {}" }),
    (error) => {
      assert.equal(error.providerDiagnostics.errorMessage, null);
      assert.equal(error.providerDiagnostics.httpStatus, 200);
      assert.equal(
        error.safeMessage,
        "JDoodle rejected the execution request.",
      );
      return true;
    },
  );
});

test("redacts credentials, source, and stdin from provider messages and logs", async () => {
  const sourceCode =
    "class SecretProgram { static String marker = 'src-private-456'; }";
  const stdin = "stdin-private-789";
  mockResponse.body = {
    statusCode: 400,
    error: `Rejected clientId test-client-id clientSecret test-client-secret Authorization: Bearer token-private Authorization: Basic auth-private-token ${sourceCode} ${stdin} {"sourceCode":"echoed-source-not-sent","stdin":"echoed-input-not-sent","expectedOutput":"hidden-output-not-sent"}`,
  };
  await assert.rejects(
    jdoodle.submitAndPoll({ language: "Java", sourceCode, stdin }),
    (error) => {
      const visible = JSON.stringify({
        safeMessage: error.safeMessage,
        diagnostics: error.providerDiagnostics,
      });
      for (const secret of [
        "test-client-id",
        "test-client-secret",
        "src-private-456",
        stdin,
        "token-private",
        "auth-private-token",
        "echoed-source-not-sent",
        "echoed-input-not-sent",
        "hidden-output-not-sent",
      ]) {
        assert.equal(visible.includes(secret), false);
      }
      return true;
    },
  );
  const logged = JSON.stringify(providerLogs);
  for (const sensitive of [
    "test-client-id",
    "test-client-secret",
    "src-private-456",
    stdin,
    "token-private",
    "auth-private-token",
    "echoed-source-not-sent",
    "echoed-input-not-sent",
    "hidden-output-not-sent",
  ]) {
    assert.equal(logged.includes(sensitive), false);
  }
  assert.equal(logged.includes('"script"'), false);
  assert.equal(logged.includes('"stdin"'), false);
});

test("classifies network timeouts and malformed provider responses", async () => {
  mockResponse.error = Object.assign(new Error("timed out"), {
    name: "TimeoutError",
  });
  mockResponse.creditError = null;
  await assert.rejects(
    jdoodle.submitAndPoll({
      language: "Java",
      sourceCode: "class Main {}",
      stdin: "",
    }),
    (error) =>
      error.code === "JDOODLE_REQUEST_TIMEOUT" && error.retryable === false,
  );
  mockResponse.error = null;
  mockResponse.body = {
    statusCode: 200,
    memory: "not-a-number",
    cpuTime: "bad",
  };
  await assert.rejects(
    jdoodle.submitAndPoll({
      language: "Java",
      sourceCode: "class Main {}",
      stdin: "",
    }),
    (error) => error.code === "JDOODLE_PROVIDER_RESPONSE_INVALID",
  );
});

test("rejects unsupported languages and reports missing credentials", async () => {
  await assert.rejects(
    jdoodle.submitAndPoll({
      language: "Python",
      sourceCode: "print(1)",
      stdin: "",
    }),
    (error) => error.code === "CODING_LANGUAGE_UNSUPPORTED",
  );
  delete process.env.JDOODLE_CLIENT_SECRET;
  assert.throws(
    () => jdoodle.configuration(),
    (error) => error.code === "JDOODLE_UNAVAILABLE",
  );
});

test("pins the documented JDK 21 version index and validates the request timeout", () => {
  delete process.env.JDOODLE_JAVA_VERSION_INDEX;
  assert.equal(jdoodle.configuration().versionIndex, "5");
  process.env.JDOODLE_REQUEST_TIMEOUT_MS = "100";
  assert.throws(
    () => jdoodle.configuration(),
    (error) => error.code === "JDOODLE_CONFIGURATION_INVALID",
  );
});

test("rejects an invalid Java version index before making a provider request", async () => {
  process.env.JDOODLE_JAVA_VERSION_INDEX = "not-an-index";
  const requestCount = requests.length;
  await assert.rejects(
    jdoodle.compile({ language: "Java", sourceCode: "class Main {}" }),
    (error) => error.code === "JDOODLE_CONFIGURATION_INVALID",
  );
  assert.equal(requests.length, requestCount);
});

test("reads and caches daily credit usage without exposing credentials", async () => {
  mockResponse.used = 7;
  const usage = await credits.getUsage();
  const cached = await credits.getUsage();
  assert.deepEqual(
    {
      used: usage.used,
      dailyLimit: usage.dailyLimit,
      remaining: usage.remaining,
    },
    { used: 7, dailyLimit: 20, remaining: 13 },
  );
  assert.deepEqual(cached, usage);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.jdoodle.com/v1/credit-spent");
  assert.deepEqual(requests[0].body, {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
  });
});

test("refuses execution at the daily limit and records reserved successful executions", async () => {
  mockResponse.used = 20;
  await assert.rejects(
    credits.reserveExecutionCredit(),
    (error) =>
      error.code === "JDOODLE_CREDITS_EXHAUSTED" && error.usage.remaining === 0,
  );
  assert.equal(requests.length, 1);

  credits.invalidateUsage();
  mockResponse.used = 4;
  const reservation = await credits.reserveExecutionCredit();
  reservation.commit();
  const usage = await credits.getUsage();
  assert.equal(usage.used, 5);
});

test("serializes concurrent reservations at the final available credit", async () => {
  process.env.JDOODLE_DAILY_CREDIT_LIMIT = "1";
  const reservations = await Promise.allSettled([
    credits.reserveExecutionCredit(),
    credits.reserveExecutionCredit(),
  ]);
  const accepted = reservations.filter((item) => item.status === "fulfilled");
  const rejected = reservations.filter((item) => item.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "JDOODLE_CREDITS_EXHAUSTED");
  accepted[0].value.release();
});
