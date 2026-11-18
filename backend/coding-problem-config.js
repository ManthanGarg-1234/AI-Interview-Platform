"use strict";

const { z } = require("zod");

const languages = ["C", "C++", "Java", "Python", "JavaScript"];
const testCasePayloadLimit = 50_000;
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const executionModeSchema = z.enum(["STDIN_STDOUT", "FUNCTION_BASED"]);
const serializationFormatSchema = z.enum(["JSON", "JSON_LINES", "RAW_TEXT"]);
const comparisonConfigSchema = z.object({
  mode: z.enum(["TRIM_TRAILING_WHITESPACE", "EXACT", "FLOAT_TOLERANCE"]),
  absoluteTolerance: z.number().finite().min(0).max(1).optional(),
  relativeTolerance: z.number().finite().min(0).max(1).optional(),
}).strict().superRefine((config, context) => {
  if (config.mode === "FLOAT_TOLERANCE" && config.absoluteTolerance === undefined && config.relativeTolerance === undefined) {
    context.addIssue({ code: "custom", message: "Float comparison requires an absolute or relative tolerance." });
  }
  if (config.mode !== "FLOAT_TOLERANCE" && (config.absoluteTolerance !== undefined || config.relativeTolerance !== undefined)) {
    context.addIssue({ code: "custom", message: "Tolerances are only valid for float comparison." });
  }
});

const parameterSchema = z.object({
  name: identifier,
  type: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
}).strict();

const languageConfigSchema = z.object({
  language: z.enum(languages),
  starterCode: z.string().max(50_000),
  functionSignature: z.string().trim().min(1).max(2_000).optional(),
  harnessTemplate: z.string().max(50_000).optional(),
  enabled: z.boolean().default(true),
}).strict();

const functionProblemConfigSchema = z.object({
  executionMode: executionModeSchema.default("STDIN_STDOUT"),
  functionName: identifier.optional(),
  className: identifier.optional(),
  parameterDefinitions: z.array(parameterSchema).max(100).optional(),
  returnType: z.string().trim().min(1).max(120).optional(),
  inputSerializationFormat: serializationFormatSchema.optional(),
  outputSerializationFormat: serializationFormatSchema.optional(),
  languageConfigs: z.array(languageConfigSchema).min(1).max(languages.length),
}).strict().superRefine((config, context) => {
  if (!config.languageConfigs.some((languageConfig) => languageConfig.enabled)) {
    context.addIssue({ code: "custom", path: ["languageConfigs"], message: "Coding problems require at least one enabled language configuration." });
  }
  const configuredLanguages = new Set();
  config.languageConfigs.forEach((languageConfig, index) => {
    if (configuredLanguages.has(languageConfig.language)) {
      context.addIssue({ code: "custom", path: ["languageConfigs", index, "language"], message: "Language configuration must be unique." });
    }
    configuredLanguages.add(languageConfig.language);
  });
  if (config.executionMode !== "FUNCTION_BASED") {
    for (const field of ["functionName", "className", "parameterDefinitions", "returnType", "inputSerializationFormat", "outputSerializationFormat"]) {
      if (config[field] !== undefined) {
        context.addIssue({ code: "custom", path: [field], message: `${field} is only valid for function-based problems.` });
      }
    }
    return;
  }

  for (const [field, value] of Object.entries({
    functionName: config.functionName,
    parameterDefinitions: config.parameterDefinitions,
    returnType: config.returnType,
    inputSerializationFormat: config.inputSerializationFormat,
    outputSerializationFormat: config.outputSerializationFormat,
  })) {
    if (value === undefined) {
      context.addIssue({ code: "custom", path: [field], message: `${field} is required for function-based problems.` });
    }
  }

  const names = config.parameterDefinitions?.map((parameter) => parameter.name) || [];
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: "custom", path: ["parameterDefinitions"], message: "Parameter names must be unique." });
  }

  config.languageConfigs.forEach((languageConfig, index) => {
    if (!languageConfig.enabled) return;
    if (!languageConfig.functionSignature) {
      context.addIssue({ code: "custom", path: ["languageConfigs", index, "functionSignature"], message: "Enabled function-based languages require a function signature." });
    }
    if (!languageConfig.harnessTemplate || (languageConfig.harnessTemplate.match(/\{\{USER_CODE\}\}/g) || []).length !== 1) {
      context.addIssue({ code: "custom", path: ["languageConfigs", index, "harnessTemplate"], message: "Enabled function-based languages require a harness template with exactly one {{USER_CODE}} placeholder." });
    }
  });
});

const testCaseSchema = z.object({
  kind: z.enum(["PUBLIC", "HIDDEN"]),
  input: z.string().max(testCasePayloadLimit),
  expectedOutput: z.string().max(testCasePayloadLimit),
  sequence: z.number().int().min(0).max(2_147_483_647),
  weight: z.number().finite().positive().max(999_999.99).default(1),
  comparisonConfig: comparisonConfigSchema.default({ mode: "TRIM_TRAILING_WHITESPACE" }),
  enabled: z.boolean().default(true),
}).strict();

const testCaseUpdateSchema = z.object({
  kind: z.enum(["PUBLIC", "HIDDEN"]).optional(),
  input: z.string().max(testCasePayloadLimit).optional(),
  expectedOutput: z.string().max(testCasePayloadLimit).optional(),
  sequence: z.number().int().min(0).max(2_147_483_647).optional(),
  weight: z.number().finite().positive().max(999_999.99).optional(),
  comparisonConfig: comparisonConfigSchema.optional(),
  enabled: z.boolean().optional(),
}).strict().superRefine((testCase, context) => {
  if (Object.keys(testCase).length === 0) {
    context.addIssue({ code: "custom", message: "At least one test-case field must be provided." });
  }
});

function effectiveExecutionMode(problem) {
  return problem?.executionMode || "STDIN_STDOUT";
}

function publicTestCaseMetadata(testCase) {
  if (testCase.kind !== "PUBLIC") return null;
  return {
    id: testCase.id,
    kind: "PUBLIC",
    sequence: testCase.sequence,
    weight: Number(testCase.weight),
    comparisonConfig: testCase.comparisonConfig,
  };
}

module.exports = {
  comparisonConfigSchema,
  effectiveExecutionMode,
  functionProblemConfigSchema,
  languageConfigSchema,
  publicTestCaseMetadata,
  testCaseSchema,
  testCaseUpdateSchema,
};
