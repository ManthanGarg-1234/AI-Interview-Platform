"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  effectiveExecutionMode,
  functionProblemConfigSchema,
  publicTestCaseMetadata,
  testCaseSchema,
  testCaseUpdateSchema,
} = require("../coding-problem-config");

const languages = ["C", "C++", "Java", "Python", "JavaScript"];

function functionProblem(overrides = {}) {
  return {
    executionMode: "FUNCTION_BASED",
    functionName: "sumValues",
    className: "Solution",
    parameterDefinitions: [{ name: "left", type: "integer" }, { name: "right", type: "integer" }],
    returnType: "integer",
    inputSerializationFormat: "JSON",
    outputSerializationFormat: "JSON",
    languageConfigs: languages.map((language) => ({
      language,
      starterCode: "",
      functionSignature: "sumValues(left, right)",
      harnessTemplate: "trusted harness\n{{USER_CODE}}\ntrusted runner",
    })),
    ...overrides,
  };
}

test("legacy problems without executionMode continue to use standard input/output", () => {
  assert.equal(effectiveExecutionMode({}), "STDIN_STDOUT");
  assert.equal(effectiveExecutionMode({ executionMode: null }), "STDIN_STDOUT");
  assert.equal(functionProblemConfigSchema.parse({
    languageConfigs: [{ language: "Python", starterCode: "" }],
  }).executionMode, "STDIN_STDOUT");
});

test("standard input/output problems need no function configuration", () => {
  assert.equal(functionProblemConfigSchema.parse({
    executionMode: "STDIN_STDOUT",
    languageConfigs: [{ language: "Python", starterCode: "" }],
  }).executionMode, "STDIN_STDOUT");
  assert.equal(functionProblemConfigSchema.safeParse({
    executionMode: "STDIN_STDOUT",
    languageConfigs: [{ language: "Python", starterCode: "", functionName: "run" }],
  }).success, false);
});

test("function-based configuration validates for all supported languages", () => {
  assert.deepEqual(functionProblemConfigSchema.parse(functionProblem()).languageConfigs.map(({ language }) => language), languages);
});

test("function-based configuration rejects invalid mode and incomplete signatures or harnesses", () => {
  assert.equal(functionProblemConfigSchema.safeParse({
    executionMode: "OTHER",
    languageConfigs: [{ language: "Python", starterCode: "" }],
  }).success, false);
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({ functionName: undefined })).success, false);
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({
    languageConfigs: [{ language: "Python", starterCode: "", functionSignature: "sumValues(left, right)" }],
  })).success, false);
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({
    languageConfigs: [{ language: "Python", starterCode: "", functionSignature: "sumValues(left, right)", harnessTemplate: "{{USER_CODE}} {{USER_CODE}}" }],
  })).success, false);
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({ languageConfigs: [] })).success, false);
});

test("function parameter names must be valid and unique", () => {
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({
    parameterDefinitions: [{ name: "left", type: "int" }, { name: "left", type: "int" }],
  })).success, false);
  assert.equal(functionProblemConfigSchema.safeParse(functionProblem({
    parameterDefinitions: [{ name: "left value", type: "int" }],
  })).success, false);
});

test("test-case validation defaults weight, comparator, and enabled state", () => {
  assert.deepEqual(testCaseSchema.parse({ kind: "PUBLIC", input: "1", expectedOutput: "1", sequence: 0 }), {
    kind: "PUBLIC",
    input: "1",
    expectedOutput: "1",
    sequence: 0,
    weight: 1,
    comparisonConfig: { mode: "TRIM_TRAILING_WHITESPACE" },
    enabled: true,
  });
  assert.equal(testCaseSchema.safeParse({ kind: "HIDDEN", input: "x", expectedOutput: "x", sequence: -1 }).success, false);
  assert.equal(testCaseSchema.safeParse({ kind: "HIDDEN", input: "x", expectedOutput: "x", sequence: 1, weight: 0 }).success, false);
  assert.equal(testCaseSchema.safeParse({ kind: "HIDDEN", input: "x", expectedOutput: "x", sequence: 1, comparisonConfig: { mode: "FLOAT_TOLERANCE" } }).success, false);
  assert.equal(testCaseSchema.safeParse({ kind: "HIDDEN", input: "x", expectedOutput: "x", sequence: 1, inputRef: "private/input" }).success, false);
});

test("test-case updates require valid fields and reject empty updates", () => {
  assert.equal(testCaseUpdateSchema.safeParse({}).success, false);
  assert.equal(testCaseUpdateSchema.safeParse({ enabled: false }).success, true);
  assert.equal(testCaseUpdateSchema.safeParse({ kind: "SECRET" }).success, false);
});

test("student test-case metadata excludes hidden cases and private storage references", () => {
  const hidden = publicTestCaseMetadata({
    id: "hidden-id",
    kind: "HIDDEN",
    sequence: 2,
    weight: "2.50",
    inputRef: "private/hidden-input",
    expectedOutputRef: "private/hidden-output",
    input: "hidden input",
  });
  assert.equal(hidden, null);

  const publicMetadata = publicTestCaseMetadata({
    id: "public-id",
    kind: "PUBLIC",
    sequence: 1,
    weight: "1.25",
    comparisonConfig: { mode: "EXACT" },
    inputRef: "private/public-input",
    expectedOutputRef: "private/public-output",
    input: "public input",
  });
  assert.deepEqual(publicMetadata, {
    id: "public-id",
    kind: "PUBLIC",
    sequence: 1,
    weight: 1.25,
    comparisonConfig: { mode: "EXACT" },
  });
  assert.doesNotMatch(JSON.stringify(publicMetadata), /private|input/);
});
