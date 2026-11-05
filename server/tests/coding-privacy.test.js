"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  safeExecutionResult,
  safeSubmissionHistoryItem,
  languages,
} = require("../coding");

test("coding API enables Java execution only", () => {
  assert.deepEqual(languages, ["Java"]);
});

test("student submission serialization exposes safe public feedback only", () => {
  const result = safeExecutionResult({
    id: "result-id",
    provider: "jdoodle",
    passedTests: 1,
    totalTests: 2,
    executionTimeMs: 20,
    memoryKb: 100,
    failureCode: "WRONG_ANSWER",
    stdout: "hidden-output",
    stderr: "hidden-error",
    compileOutput: "hidden-compile",
    perTestSummary: {
      tests: [
        {
          sequence: 1,
          kind: "PUBLIC",
          passed: true,
          verdict: "ACCEPTED",
          executionTimeMs: 10,
          memoryKb: 50,
          input: "public-input",
          expected: "public-output",
        },
        {
          sequence: 2,
          kind: "HIDDEN",
          passed: false,
          verdict: "WRONG_ANSWER",
          executionTimeMs: 10,
          memoryKb: 50,
          input: "hidden-input",
          expected: "hidden-output",
        },
      ],
      publicFeedback: {
        stdout: "public-output",
        stderr: "",
        compileOutput: "",
      },
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  assert.equal(result.stdout, "public-output");
  assert.equal(result.stderr, "");
  assert.equal(result.compileOutput, "");
  assert.deepEqual(result.perTestSummary, [
    {
      sequence: 1,
      kind: "PUBLIC",
      passed: true,
      verdict: "ACCEPTED",
      executionTimeMs: 10,
      memoryKb: 50,
    },
    {
      sequence: 2,
      kind: "HIDDEN",
      passed: false,
      verdict: "WRONG_ANSWER",
      executionTimeMs: 10,
      memoryKb: 50,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /hidden-(input|output|error|compile)/,
  );
});

test("student submission serialization does not expose raw output without public feedback", () => {
  const result = safeExecutionResult({
    id: "result-id",
    provider: "jdoodle",
    passedTests: 0,
    totalTests: 1,
    stdout: "raw-hidden-output",
    stderr: "raw-hidden-error",
    compileOutput: "raw-hidden-compile",
    perTestSummary: {
      tests: [
        {
          sequence: 1,
          kind: "HIDDEN",
          passed: false,
          verdict: "RUNTIME_ERROR",
        },
      ],
    },
  });

  test("submission history serialization excludes source and execution output", () => {
    const result = safeSubmissionHistoryItem({
      id: "submission-id",
      language: "Python",
      status: "FAILED",
      verdict: "WRONG_ANSWER",
      sourceCode: "print('secret')",
      stdout: "hidden-output",
      stderr: "hidden-error",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: new Date("2026-01-01T00:00:01Z"),
      problem: {
        id: "problem-id",
        slug: "problem",
        title: "Problem",
        difficulty: "Easy",
      },
    });
    assert.deepEqual(result, {
      id: "submission-id",
      language: "Python",
      status: "FAILED",
      verdict: "WRONG_ANSWER",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: new Date("2026-01-01T00:00:01Z"),
      problem: {
        id: "problem-id",
        slug: "problem",
        title: "Problem",
        difficulty: "Easy",
      },
    });
    assert.doesNotMatch(JSON.stringify(result), /secret|hidden/);
  });
  assert.equal("stdout" in result, false);
  assert.equal("stderr" in result, false);
  assert.equal("compileOutput" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /raw-hidden/);
});
