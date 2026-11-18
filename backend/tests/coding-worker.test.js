"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const storage = require("../private-storage");
const credits = require("../jdoodle-credits");
const originalFetch = global.fetch;
const {
  executeCodingJob,
  executeRun,
  executeSubmission,
} = require("../coding-worker");

const storedKeys = [];
const providerScenarios = [];
const compileScenarios = [];
const submittedExecutions = [];
const submittedCompilations = [];

function fakePrisma(
  expected,
  testCases = [
    {
      sequence: 1,
      kind: "PUBLIC",
      enabled: true,
      inputRef: storedKeys[0],
      expectedOutputRef: expected,
    },
    {
      sequence: 2,
      kind: "HIDDEN",
      enabled: true,
      inputRef: storedKeys[1],
      expectedOutputRef: expected,
    },
  ],
  {
    language = "Java",
    sourceCode = "class Main {}",
    executionMode = "STDIN_STDOUT",
    languageConfig = {},
  } = {},
) {
  const calls = {
    statuses: [],
    result: null,
    progress: false,
    sheetProgress: [],
    claimCount: 1,
  };
  const submission = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    problemId: crypto.randomUUID(),
    language,
    sourceCode,
    status: "QUEUED",
    problem: {
      timeLimitMs: 2_000,
      memoryLimitKb: 262_144,
      executionMode,
      testCases: testCases
        .filter((testCase) => testCase.enabled)
        .map((testCase) => ({ weight: 1, ...testCase })),
      languageConfigs: [{ language, enabled: true, ...languageConfig }],
    },
  };
  calls.userId = submission.userId;
  const tx = {
    executionResult: {
      create: async ({ data }) => {
        calls.result = data;
      },
    },
    codeSubmission: {
      update: async ({ data }) => {
        calls.submissionUpdate = data;
      },
      updateMany: async () => ({ count: calls.claimCount }),
      findUnique: async () => ({ status: "RUNNING" }),
    },
    submissionStatusHistory: {
      create: async ({ data }) => calls.statuses.push(data),
    },
    studentProblemProgress: {
      update: async () => {
        calls.progress = true;
      },
    },
    dSASheetProblem: {
      findMany: async () => [{ id: "sheet-entry-1", sheetId: "sheet-1" }],
    },
    dSASheetProgress: {
      upsert: async ({ where, create }) =>
        calls.sheetProgress.push({ where, create }),
    },
  };
  return {
    calls,
    submission,
    codeSubmission: {
      ...tx.codeSubmission,
      findUnique: async () => submission,
    },
    submissionStatusHistory: tx.submissionStatusHistory,
    $transaction: async (callback) => callback(tx),
  };
}

function fakeRunPrisma({
  language = "Java",
  sourceCode = "class Main {}",
  customInput = null,
  testCases = [],
  executionMode = "STDIN_STDOUT",
  languageConfig,
} = {}) {
  const updates = [];
  const run = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    problemId: crypto.randomUUID(),
    language,
    sourceCode,
    customInput,
    status: "QUEUED",
    problem: {
      timeLimitMs: 1_000,
      memoryLimitKb: 65_536,
      executionMode,
      testCases,
      languageConfigs: [
        {
          language,
          enabled: true,
          ...(languageConfig || {}),
        },
      ],
    },
  };
  let query;
  return {
    run,
    updates,
    get query() {
      return query;
    },
    codeRun: {
      findUnique: async (args) => {
        query = args;
        const testCaseFilter = args.include.problem.include.testCases.where;
        return {
          ...run,
          problem: {
            ...run.problem,
            testCases: run.problem.testCases.filter(
              (item) => item.enabled && item.kind === testCaseFilter.kind,
            ),
          },
        };
      },
      update: async ({ data }) => updates.push(data),
      updateMany: async ({ data }) => updates.push(data),
    },
  };
}

async function storeRunCase({
  kind = "PUBLIC",
  input,
  expected,
  sequence = 1,
  comparisonConfig = { mode: "TRIM_TRAILING_WHITESPACE" },
}) {
  const inputRef = `run-tests/${crypto.randomUUID()}-input`;
  const expectedOutputRef = `run-tests/${crypto.randomUUID()}-expected`;
  await storage.put(inputRef, Buffer.from(input));
  await storage.put(expectedOutputRef, Buffer.from(expected));
  storedKeys.push(inputRef, expectedOutputRef);
  return {
    id: crypto.randomUUID(),
    kind,
    enabled: true,
    inputRef,
    expectedOutputRef,
    sequence,
    comparisonConfig,
  };
}

test.before(async () => {
  process.env.JDOODLE_CLIENT_ID = "test-client-id";
  process.env.JDOODLE_CLIENT_SECRET = "test-client-secret";
  process.env.JDOODLE_JAVA_VERSION_INDEX = "5";
  process.env.JDOODLE_REQUEST_TIMEOUT_MS = "1000";
  const inputOne = `worker-${crypto.randomUUID()}-one`;
  const inputTwo = `worker-${crypto.randomUUID()}-two`;
  const output = "ok\n";
  for (const [key, value] of [
    ["input-one", inputOne],
    ["input-two", inputTwo],
    ["output", output],
  ]) {
    const stored = await storage.put(
      `tests/${crypto.randomUUID()}-${key}`,
      Buffer.from(value),
    );
    storedKeys.push(stored.key);
  }
  global.fetch = async (url, options) => {
    if (url === "https://api.jdoodle.com/v1/credit-spent") {
      return { ok: true, status: 200, json: async () => ({ used: 0 }) };
    }
    assert.equal(url, "https://api.jdoodle.com/v1/execute");
    const request = JSON.parse(options.body);
    if (request.compileOnly) {
      const scenario = compileScenarios.shift() || { compiled: true };
      submittedCompilations.push({
        sourceCode: request.script,
        language: request.language,
        versionIndex: request.versionIndex,
      });
      const body = scenario.malformed
        ? { statusCode: 200 }
        : {
            statusCode: 200,
            compilationStatus: scenario.compiled === false ? 1 : 0,
            output: scenario.output || "",
          };
      return { ok: true, status: 200, json: async () => body };
    }
    const scenario = providerScenarios.shift() || { stdout: "ok\n" };
    submittedExecutions.push({
      sourceCode: request.script,
      stdin: request.stdin,
      language: request.language,
      versionIndex: request.versionIndex,
    });
    const status = scenario.httpStatus || 200;
    const body =
      status === 200
        ? {
            statusCode: 200,
            output: scenario.output ?? scenario.stdout ?? "",
            memory: scenario.memory ?? "1024",
            cpuTime: scenario.cpuTime ?? "0.001",
          }
        : { error: "mock provider failure" };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  providerScenarios.length = 0;
  compileScenarios.length = 0;
  submittedExecutions.length = 0;
  submittedCompilations.length = 0;
});

test.beforeEach(() => {
  providerScenarios.length = 0;
  compileScenarios.length = 0;
  credits.invalidateUsage();
});

test.after(async () => {
  await Promise.all(storedKeys.map((key) => storage.remove(key)));
  global.fetch = originalFetch;
});

test("worker accepts all tests and stores no hidden inputs or expected output", async () => {
  const prisma = fakePrisma(storedKeys[2]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 2);
  assert.equal(prisma.calls.result.totalTests, 2);
  assert.equal(prisma.calls.result.perTestSummary.tests.length, 2);
  assert.equal(prisma.calls.result.perTestSummary.evaluatedTests, 2);
  assert.equal(prisma.calls.result.perTestSummary.score, 100);
  assert.ok(prisma.calls.progress);
  assert.equal(prisma.calls.sheetProgress.length, 1);
  assert.deepEqual(prisma.calls.sheetProgress[0].where, {
    sheetProblemId_userId: {
      sheetProblemId: "sheet-entry-1",
      userId: prisma.calls.userId,
    },
  });
  assert.deepEqual(
    { ...prisma.calls.sheetProgress[0].create, solvedAt: undefined },
    {
      sheetId: "sheet-1",
      sheetProblemId: "sheet-entry-1",
      userId: prisma.calls.userId,
      status: "SOLVED",
      solvedAt: undefined,
    },
  );
  assert.ok(prisma.calls.sheetProgress[0].create.solvedAt instanceof Date);
  assert.doesNotMatch(
    JSON.stringify(prisma.calls.result.perTestSummary),
    /worker-/,
  );
});

test("Submit evaluates every hidden test, returns only safe case summaries, and scores partial credit", async () => {
  const cases = [
    await storeRunCase({
      kind: "PUBLIC",
      input: "public",
      expected: "public result",
      sequence: 1,
    }),
    await storeRunCase({
      kind: "HIDDEN",
      input: "hidden-input-secret",
      expected: "hidden-result-secret",
      sequence: 2,
    }),
    await storeRunCase({
      kind: "HIDDEN",
      input: "second-hidden-secret",
      expected: "second-secret",
      sequence: 3,
    }),
  ];
  cases[1].weight = 2;
  cases[2].weight = 1;
  providerScenarios.push(
    { stdout: "public result" },
    { stdout: "wrong result" },
    { stdout: "also wrong" },
  );
  const prisma = fakePrisma(cases[0].expectedOutputRef, cases);
  await executeSubmission(prisma, "submission-id");

  const result = prisma.calls.result;
  assert.equal(result.totalTests, 3);
  assert.equal(result.passedTests, 1);
  assert.equal(result.perTestSummary.evaluatedTests, 3);
  assert.equal(result.perTestSummary.score, 25);
  assert.deepEqual(
    result.perTestSummary.tests.map((item) => item.verdict),
    ["ACCEPTED", "WRONG_ANSWER", "WRONG_ANSWER"],
  );
  assert.equal(result.perTestSummary.tests[0].stdout, "public result");
  assert.equal("stdout" in result.perTestSummary.tests[1], false);
  assert.equal("stderr" in result.perTestSummary.tests[2], false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /hidden-input-secret|hidden-result-secret|second-hidden-secret/,
  );
  assert.equal(prisma.calls.submissionUpdate.status, "WRONG_ANSWER");
});

test("Submit uses JDoodle Java and the configured version index", async () => {
  const prisma = fakePrisma(storedKeys[2], [
    {
      sequence: 1,
      kind: "PUBLIC",
      enabled: true,
      inputRef: storedKeys[0],
      expectedOutputRef: storedKeys[2],
    },
  ]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(submittedCompilations.at(-1).language, "java");
  assert.equal(submittedCompilations.at(-1).versionIndex, "5");
  assert.equal(submittedExecutions.at(-1).language, "java");
  assert.equal(prisma.calls.submissionUpdate.status, "ACCEPTED");
});

test("Submit composes the trusted function harness and serializes function arguments", async () => {
  const testCase = await storeRunCase({ input: '{"value":2}', expected: "4" });
  providerScenarios.push({ stdout: "4" });
  const prisma = fakePrisma(testCase.expectedOutputRef, [testCase], {
    executionMode: "FUNCTION_BASED",
    languageConfig: {
      functionSignature: "solve(value)",
      harnessTemplate: "trusted-header\n{{USER_CODE}}\ntrusted-footer",
    },
  });
  Object.assign(prisma.submission.problem, {
    functionName: "solve",
    parameterDefinitions: [{ name: "value", type: "integer" }],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
  });

  await executeSubmission(prisma, "submission-id");

  const sent = submittedExecutions.at(-1);
  assert.equal(sent.stdin, '{"value":2}');
  assert.match(sent.sourceCode, /^trusted-header\n/);
  assert.match(sent.sourceCode, /trusted-footer$/);
  assert.equal(prisma.calls.submissionUpdate.status, "ACCEPTED");
});

test("Submit verdict precedence keeps infrastructure errors above wrong answers", async () => {
  const cases = [
    await storeRunCase({
      input: "first",
      expected: "expected one",
      sequence: 1,
    }),
    await storeRunCase({
      kind: "HIDDEN",
      input: "second",
      expected: "expected two",
      sequence: 2,
    }),
  ];
  providerScenarios.push({ stdout: "wrong" }, { httpStatus: 500 });
  const prisma = fakePrisma(cases[0].expectedOutputRef, cases);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.perTestSummary.evaluatedTests, 1);
  assert.equal(prisma.calls.submissionUpdate.status, "SYSTEM_ERROR");
});

test("Submit records compile failures without spending execution credits on test cases", async () => {
  const before = submittedExecutions.length;
  compileScenarios.push({
    compiled: false,
    output: "Main.java:1: error: expected ';'",
  });
  const prisma = fakePrisma(storedKeys[2]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(submittedExecutions.length, before);
  assert.equal(prisma.calls.submissionUpdate.status, "COMPILATION_ERROR");
  assert.equal(prisma.calls.result.failureCode, "COMPILATION_ERROR");
  assert.match(prisma.calls.result.compileOutput, /expected/);
});

test("queue worker does not persist provider credentials or result tokens", async () => {
  const prisma = fakePrisma(storedKeys[2]);
  const job = {
    data: { kind: "submission", id: "submission-id", provider: "jdoodle" },
    opts: { attempts: 3 },
    attemptsMade: 0,
    async updateData(data) {
      this.data = data;
    },
  };

  await executeCodingJob(prisma, job);

  assert.doesNotMatch(
    JSON.stringify(job.data),
    /clientSecret|clientId|providerToken/i,
  );
});

test("stale legacy provider queue state fails without a JDoodle execution", async () => {
  const prisma = fakeRunPrisma({
    sourceCode: "class Main {}",
    customInput: "",
  });
  const compiledBefore = submittedCompilations.length;
  const executedBefore = submittedExecutions.length;
  await executeCodingJob(prisma, {
    data: {
      kind: "run",
      id: prisma.run.id,
      providerTokens: { "PUBLIC:1:0": "old-provider-token" },
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    async updateData(data) {
      this.data = data;
    },
  });
  assert.equal(submittedCompilations.length, compiledBefore);
  assert.equal(submittedExecutions.length, executedBefore);
  assert.equal(prisma.updates.at(-1).status, "FAILED");
  assert.match(prisma.updates.at(-1).stderr, /provider migration/);
});

test("duplicate workers cannot claim a submission already being processed", async () => {
  const prisma = fakePrisma(storedKeys[2]);
  prisma.calls.claimCount = 0;
  const before = submittedExecutions.length;
  await executeSubmission(prisma, "submission-id");
  assert.equal(submittedExecutions.length, before);
  assert.equal(prisma.calls.result, null);
});

test("provider failures become system errors and do not retry paid calls", async () => {
  providerScenarios.push({ httpStatus: 429 });
  const prisma = fakePrisma(storedKeys[2], [
    {
      sequence: 1,
      kind: "PUBLIC",
      enabled: true,
      inputRef: storedKeys[0],
      expectedOutputRef: storedKeys[2],
    },
  ]);
  const before = submittedExecutions.length;
  await executeSubmission(prisma, "submission-id");
  assert.equal(submittedExecutions.length, before + 1);
  assert.equal(prisma.calls.submissionUpdate.status, "SYSTEM_ERROR");
  assert.equal(prisma.calls.result.failureCode, "JDOODLE_CREDITS_EXHAUSTED");
  assert.match(
    prisma.calls.result.stderr,
    /daily execution credits are exhausted/,
  );
  assert.equal(prisma.calls.submissionUpdate.verdict, "SYSTEM_ERROR");
  assert.notEqual(prisma.calls.submissionUpdate.verdict, "WRONG_ANSWER");
});

test("zero enabled tests fail safely without solving progress", async () => {
  const prisma = fakePrisma(storedKeys[2], []);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 0);
  assert.equal(prisma.calls.result.failureCode, "SYSTEM_ERROR");
  assert.equal(prisma.calls.submissionUpdate.status, "SYSTEM_ERROR");
  assert.equal(prisma.calls.progress, false);
  assert.equal(prisma.calls.sheetProgress.length, 0);
});

test("all disabled tests fail safely without solving progress", async () => {
  const prisma = fakePrisma(storedKeys[2], [
    {
      sequence: 1,
      kind: "PUBLIC",
      enabled: false,
      inputRef: storedKeys[0],
      expectedOutputRef: storedKeys[2],
    },
  ]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 0);
  assert.equal(prisma.calls.result.failureCode, "SYSTEM_ERROR");
  assert.equal(prisma.calls.progress, false);
  assert.equal(prisma.calls.sheetProgress.length, 0);
});

test("missing test-case storage fails safely with no executed tests", async () => {
  const prisma = fakePrisma("tests/missing-expected-output", [
    {
      sequence: 1,
      kind: "PUBLIC",
      enabled: true,
      inputRef: storedKeys[0],
      expectedOutputRef: "tests/missing-expected-output",
    },
  ]);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.totalTests, 1);
  assert.equal(
    prisma.calls.result.failureCode,
    "TEST_CASE_STORAGE_UNAVAILABLE",
  );
  assert.equal(prisma.calls.submissionUpdate.status, "SYSTEM_ERROR");
  assert.equal(prisma.calls.progress, false);
  assert.equal(prisma.calls.sheetProgress.length, 0);
});

test("worker records a wrong answer and does not mark progress solved", async () => {
  const wrongOutput = await storage.put(
    `tests/${crypto.randomUUID()}-wrong-output`,
    Buffer.from("wrong\n"),
  );
  const prisma = fakePrisma(wrongOutput.key);
  await executeSubmission(prisma, "submission-id");
  assert.equal(prisma.calls.result.passedTests, 0);
  assert.equal(prisma.calls.result.failureCode, "WRONG_ANSWER");
  assert.equal(prisma.calls.progress, false);
  assert.equal(prisma.calls.sheetProgress.length, 0);
  await storage.remove(wrongOutput.key);
});

test("Run executes each enabled public case, compares output, and never queries hidden cases", async () => {
  providerScenarios.push({ stdout: "one\n" }, { stdout: "two\n" });
  const cases = [
    await storeRunCase({ input: "", expected: "one", sequence: 1 }),
    await storeRunCase({ input: "2", expected: "two", sequence: 2 }),
    await storeRunCase({
      kind: "HIDDEN",
      input: "hidden",
      expected: "hidden",
      sequence: 3,
    }),
    await storeRunCase({
      kind: "PUBLIC",
      input: "disabled",
      expected: "disabled",
      sequence: 4,
    }),
  ];
  cases[3].enabled = false;
  const prisma = fakeRunPrisma({ testCases: cases });

  await executeRun(prisma, prisma.run.id);

  assert.deepEqual(prisma.query.include.problem.include.testCases.where, {
    kind: "PUBLIC",
    enabled: true,
  });
  assert.deepEqual(
    submittedExecutions.slice(-2).map(({ stdin }) => stdin),
    ["", "2"],
  );
  const result = prisma.updates.at(-1);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.verdict, "ACCEPTED");
  assert.deepEqual(result.perTestResults, {
    tests: [
      {
        sequence: 1,
        kind: "PUBLIC",
        input: "",
        expectedOutput: "one",
        stdout: "one\n",
        stderr: "",
        compileOutput: "",
        executionTimeMs: 1,
        memoryKb: 1024,
        passed: true,
        verdict: "ACCEPTED",
      },
      {
        sequence: 2,
        kind: "PUBLIC",
        input: "2",
        expectedOutput: "two",
        stdout: "two\n",
        stderr: "",
        compileOutput: "",
        executionTimeMs: 1,
        memoryKb: 1024,
        passed: true,
        verdict: "ACCEPTED",
      },
    ],
    totalTests: 2,
    executedTests: 2,
    passedTests: 2,
    failedTests: 0,
  });
  assert.doesNotMatch(JSON.stringify(result.perTestResults), /hidden|disabled/);
});

test("Run uses JDoodle Java with empty standard input", async () => {
  const prisma = fakeRunPrisma({
    sourceCode: "class Main {}",
    customInput: "",
  });
  await executeRun(prisma, prisma.run.id);
  assert.equal(prisma.updates.at(-1).verdict, "ACCEPTED");
  assert.equal(submittedExecutions.at(-1).language, "java");
  assert.equal(submittedExecutions.at(-1).versionIndex, "5");
  assert.equal(submittedExecutions.at(-1).stdin, "");
});

test("Run records wrong answers and preserves actual and expected output", async () => {
  providerScenarios.push({ stdout: "incorrect\n" });
  const testCase = await storeRunCase({ input: "x", expected: "correct\n" });
  const prisma = fakeRunPrisma({ testCases: [testCase] });
  await executeRun(prisma, prisma.run.id);

  const result = prisma.updates.at(-1);
  assert.equal(result.verdict, "WRONG_ANSWER");
  assert.equal(result.perTestResults.tests[0].stdout, "incorrect\n");
  assert.equal(result.perTestResults.tests[0].expectedOutput, "correct\n");
  assert.equal(result.perTestResults.tests[0].passed, false);
});

test("Run reports compile, runtime, and timeout errors without accepting them", async () => {
  const compileBefore = submittedExecutions.length;
  compileScenarios.push({ compiled: false, output: "compiler diagnostic" });
  const compileCase = await storeRunCase({ input: "", expected: "ok\n" });
  const compilePrisma = fakeRunPrisma({ testCases: [compileCase] });
  await executeRun(compilePrisma, compilePrisma.run.id);
  assert.equal(compilePrisma.updates.at(-1).verdict, "COMPILATION_ERROR");
  assert.equal(submittedExecutions.length, compileBefore);

  for (const [output, verdict] of [
    [
      'Exception in thread \\"main\\" java.lang.IllegalStateException',
      "RUNTIME_ERROR",
    ],
    ["Execution timed out", "TIME_LIMIT_EXCEEDED"],
  ]) {
    providerScenarios.push({ output });
    const testCase = await storeRunCase({ input: "", expected: "ok\n" });
    const prisma = fakeRunPrisma({ testCases: [testCase] });
    await executeRun(prisma, prisma.run.id);
    const result = prisma.updates.at(-1);
    assert.equal(result.verdict, verdict);
    assert.notEqual(result.verdict, "ACCEPTED");
    assert.equal(result.perTestResults.failedTests, 1);
    assert.equal(result.perTestResults.tests[0].passed, false);
  }
});

test("Run supports JSON function harnesses with serialized arguments and structured output", async () => {
  providerScenarios.push({ stdout: '{"value":3}\n' });
  const testCase = await storeRunCase({
    input: "[1,2]",
    expected: '{"value":3}',
  });
  const harnessTemplate = "trusted prelude\n{{USER_CODE}}\ntrusted invocation";
  const prisma = fakeRunPrisma({
    sourceCode: "function sum(a, b) { return a + b; }",
    testCases: [testCase],
    executionMode: "FUNCTION_BASED",
    languageConfig: {
      functionSignature: "sum(a, b)",
      harnessTemplate,
    },
  });
  Object.assign(prisma.run.problem, {
    functionName: "sum",
    parameterDefinitions: [
      { name: "a", type: "integer" },
      { name: "b", type: "integer" },
    ],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
  });

  await executeRun(prisma, prisma.run.id);

  assert.equal(
    submittedExecutions.at(-1).sourceCode,
    harnessTemplate.replace("{{USER_CODE}}", prisma.run.sourceCode),
  );
  assert.equal(submittedExecutions.at(-1).stdin, "[1,2]");
  assert.equal(prisma.updates.at(-1).verdict, "ACCEPTED");
  assert.equal(prisma.updates.at(-1).perTestResults.tests[0].passed, true);
});

test("Run fails clearly when the function harness is not configured", async () => {
  const prisma = fakeRunPrisma({
    executionMode: "FUNCTION_BASED",
    languageConfig: { functionSignature: "solve(value)" },
  });
  Object.assign(prisma.run.problem, {
    functionName: "solve",
    parameterDefinitions: [{ name: "value", type: "integer" }],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
  });
  const before = submittedExecutions.length;

  await executeRun(prisma, prisma.run.id);

  assert.equal(submittedExecutions.length, before);
  assert.equal(prisma.updates.at(-1).status, "FAILED");
  assert.match(prisma.updates.at(-1).stderr, /not configured/);
});

test("Run stops on a provider failure without retrying the paid request", async () => {
  const submittedBefore = submittedExecutions.length;
  providerScenarios.push({ stdout: "first\n" }, { httpStatus: 429 });
  const cases = [
    await storeRunCase({ input: "1", expected: "first", sequence: 1 }),
    await storeRunCase({ input: "2", expected: "second", sequence: 2 }),
  ];
  const prisma = fakeRunPrisma({ testCases: cases });
  await executeRun(prisma, prisma.run.id);
  assert.equal(submittedExecutions.length - submittedBefore, 2);
  assert.equal(prisma.updates.at(-1).status, "FAILED");
  assert.equal(prisma.updates.at(-1).verdict, "INTERNAL_ERROR");
  assert.match(
    prisma.updates.at(-1).stderr,
    /daily execution credits are exhausted/,
  );
  assert.notEqual(prisma.updates.at(-1).verdict, "WRONG_ANSWER");
});

test("Run compares exact output and configured float tolerances", async () => {
  const { compareText } = require("../coding-runner");
  assert.equal(compareText("answer \n", "answer", { mode: "EXACT" }), false);
  assert.equal(
    compareText("1.0001 3", "1.0 3", {
      mode: "FLOAT_TOLERANCE",
      absoluteTolerance: 0.001,
    }),
    true,
  );
  assert.equal(
    compareText("1.1", "1.0", {
      mode: "FLOAT_TOLERANCE",
      absoluteTolerance: 0.001,
    }),
    false,
  );
  assert.equal(
    compareText("", "", { mode: "FLOAT_TOLERANCE", absoluteTolerance: 0.001 }),
    false,
  );
});
