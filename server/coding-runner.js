"use strict";

const { isDeepStrictEqual } = require("node:util");
const { effectiveExecutionMode } = require("./coding-problem-config");

const harnessPlaceholder = "{{USER_CODE}}";

function functionConfigurationError(message) {
  return Object.assign(new Error(message), { code: "FUNCTION_HARNESS_UNSUPPORTED", status: 422 });
}

function assertFunctionConfiguration(problem, languageConfig) {
  if (effectiveExecutionMode(problem) !== "FUNCTION_BASED") return;
  if (!problem.functionName || !Array.isArray(problem.parameterDefinitions) ||
      !problem.returnType || !["JSON", "JSON_LINES", "RAW_TEXT"].includes(problem.inputSerializationFormat) ||
      !["JSON", "JSON_LINES", "RAW_TEXT"].includes(problem.outputSerializationFormat)) {
    throw functionConfigurationError("Function-based problem configuration is incomplete.");
  }
  if (!languageConfig || !languageConfig.functionSignature ||
      typeof languageConfig.harnessTemplate !== "string" ||
      languageConfig.harnessTemplate.split(harnessPlaceholder).length !== 2) {
    throw functionConfigurationError(`Function-based execution is not configured for ${languageConfig?.language || "the selected language"}.`);
  }
}

function parseJsonLines(value, label) {
  if (!value) return "";
  const parsed = value.split(/\r?\n/).filter((line) => line.length > 0).map((line, index) => {
    try { return JSON.parse(line); } catch (cause) {
      throw Object.assign(new Error(`${label} contains invalid JSON on line ${index + 1}.`), { code: "FUNCTION_SERIALIZATION_INVALID", cause });
    }
  });
  return parsed.map((item) => JSON.stringify(item)).join("\n");
}

function serializeFunctionInput(input, format) {
  if (format === "RAW_TEXT") return input;
  if (format === "JSON_LINES") return parseJsonLines(input, "Function input");
  if (format === "JSON") {
    try { return JSON.stringify(JSON.parse(input)); } catch (cause) {
      throw Object.assign(new Error("Function input must be valid JSON."), { code: "FUNCTION_SERIALIZATION_INVALID", cause });
    }
  }
  throw functionConfigurationError("Function input serialization format is not supported.");
}

function prepareRunSource(problem, languageConfig, sourceCode) {
  assertFunctionConfiguration(problem, languageConfig);
  if (effectiveExecutionMode(problem) !== "FUNCTION_BASED") return sourceCode;
  return languageConfig.harnessTemplate.replace(harnessPlaceholder, sourceCode);
}

function normalizedWhitespaceOutput(value) {
  return String(value || "").replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

function parseSerializedOutput(value, format, label) {
  if (format === "RAW_TEXT") return value;
  if (format === "JSON_LINES") {
    const lines = value.split(/\r?\n/).filter((line) => line.length > 0);
    try { return lines.map((line) => JSON.parse(line)); } catch (cause) {
      throw Object.assign(new Error(`${label} contains invalid JSON output.`), { code: "FUNCTION_OUTPUT_INVALID", cause });
    }
  }
  if (format === "JSON") {
    try { return JSON.parse(value); } catch (cause) {
      throw Object.assign(new Error(`${label} is not valid JSON output.`), { code: "FUNCTION_OUTPUT_INVALID", cause });
    }
  }
  throw functionConfigurationError("Function output serialization format is not supported.");
}

function compareText(actual, expected, comparisonConfig = {}) {
  const mode = comparisonConfig.mode || "TRIM_TRAILING_WHITESPACE";
  if (mode === "EXACT") return String(actual || "").replace(/\r\n/g, "\n") === String(expected || "").replace(/\r\n/g, "\n");
  if (mode === "FLOAT_TOLERANCE") {
    const actualValues = String(actual || "").trim().split(/\s+/).filter(Boolean).map(Number);
    const expectedValues = String(expected || "").trim().split(/\s+/).filter(Boolean).map(Number);
    if (actualValues.length === 0 || actualValues.length !== expectedValues.length || actualValues.some((value) => !Number.isFinite(value)) ||
        expectedValues.some((value) => !Number.isFinite(value))) return false;
    const absoluteTolerance = comparisonConfig.absoluteTolerance || 0;
    const relativeTolerance = comparisonConfig.relativeTolerance || 0;
    return actualValues.every((value, index) =>
      Math.abs(value - expectedValues[index]) <= absoluteTolerance + relativeTolerance * Math.max(Math.abs(value), Math.abs(expectedValues[index])));
  }
  return normalizedWhitespaceOutput(actual) === normalizedWhitespaceOutput(expected);
}

function outputsMatch(actual, expected, comparisonConfig, problem) {
  if (effectiveExecutionMode(problem) !== "FUNCTION_BASED" || problem.outputSerializationFormat === "RAW_TEXT") {
    return compareText(actual, expected, comparisonConfig);
  }
  const actualValue = parseSerializedOutput(actual, problem.outputSerializationFormat, "Program output");
  const expectedValue = parseSerializedOutput(expected, problem.outputSerializationFormat, "Expected output");
  return isDeepStrictEqual(actualValue, expectedValue);
}

module.exports = {
  assertFunctionConfiguration,
  compareText,
  outputsMatch,
  parseSerializedOutput,
  prepareRunSource,
  serializeFunctionInput,
};
