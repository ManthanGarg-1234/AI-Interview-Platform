"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const storage = require("./private-storage");
const {
  functionProblemConfigSchema,
  testCaseSchema,
  testCaseUpdateSchema,
} = require("./coding-problem-config");

const router = express.Router();
const uuidSchema = z.string().uuid();

function testCaseMetadata(testCase) {
  return {
    id: testCase.id,
    kind: testCase.kind,
    sequence: testCase.sequence,
    weight: Number(testCase.weight),
    comparisonConfig: testCase.comparisonConfig,
    enabled: testCase.enabled,
  };
}

function storageKey(problemId, testCaseId, field) {
  return `coding-test-cases/${problemId}/${testCaseId}/${crypto.randomUUID()}-${field}.txt`;
}

async function removeStoredFiles(keys) {
  const failures = [];
  await Promise.all(keys.map(async (key) => {
    try { await storage.remove(key); }
    catch (error) { failures.push(error); }
  }));
  return failures;
}

router.put("/problems/:problemId/configuration", async (req, res, next) => {
  try {
    const problemId = uuidSchema.parse(req.params.problemId);
    const input = functionProblemConfigSchema.parse(req.body);
    const prisma = getPrisma();
    const existing = await prisma.codingProblem.findUnique({ where: { id: problemId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Coding problem not found." } });

    await prisma.$transaction(async (tx) => {
      await tx.codingProblem.update({
        where: { id: problemId },
        data: {
          executionMode: input.executionMode,
          functionName: input.functionName ?? null,
          className: input.className ?? null,
          parameterDefinitions: input.parameterDefinitions ?? null,
          returnType: input.returnType ?? null,
          inputSerializationFormat: input.inputSerializationFormat ?? null,
          outputSerializationFormat: input.outputSerializationFormat ?? null,
        },
      });
      await tx.problemLanguageConfig.updateMany({
        where: {
          problemId,
          ...(input.languageConfigs.length ? { language: { notIn: input.languageConfigs.map(({ language }) => language) } } : {}),
        },
        data: { enabled: false },
      });
      for (const languageConfig of input.languageConfigs) {
        await tx.problemLanguageConfig.upsert({
          where: { problemId_language: { problemId, language: languageConfig.language } },
          create: {
            problemId,
            language: languageConfig.language,
            starterCode: languageConfig.starterCode,
            functionSignature: languageConfig.functionSignature ?? null,
            harnessTemplate: languageConfig.harnessTemplate ?? null,
            enabled: languageConfig.enabled,
          },
          update: {
            starterCode: languageConfig.starterCode,
            functionSignature: languageConfig.functionSignature ?? null,
            harnessTemplate: languageConfig.harnessTemplate ?? null,
            enabled: languageConfig.enabled,
          },
        });
      }
    });

    res.json({ data: { problemId, executionMode: input.executionMode, languageCount: input.languageConfigs.length } });
  } catch (error) { next(error); }
});

router.get("/problems/:problemId/test-cases", async (req, res, next) => {
  try {
    const problemId = uuidSchema.parse(req.params.problemId);
    const cases = await getPrisma().testCase.findMany({ where: { problemId }, orderBy: [{ sequence: "asc" }, { id: "asc" }] });
    const data = await Promise.all(cases.map(async (testCase) => {
      const [input, expectedOutput] = await Promise.all([
        storage.get(testCase.inputRef),
        storage.get(testCase.expectedOutputRef),
      ]);
      return { ...testCaseMetadata(testCase), input: input.toString("utf8"), expectedOutput: expectedOutput.toString("utf8") };
    }));
    res.json({ data });
  } catch (error) { next(error); }
});

router.post("/problems/:problemId/test-cases", async (req, res, next) => {
  const storedKeys = [];
  try {
    const problemId = uuidSchema.parse(req.params.problemId);
    const input = testCaseSchema.parse(req.body);
    const prisma = getPrisma();
    const problem = await prisma.codingProblem.findUnique({ where: { id: problemId }, select: { id: true } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Coding problem not found." } });

    const testCaseId = crypto.randomUUID();
    const inputKey = storageKey(problemId, testCaseId, "input");
    const expectedKey = storageKey(problemId, testCaseId, "expected");
    let created;
    try {
      await storage.put(inputKey, Buffer.from(input.input, "utf8"));
      storedKeys.push(inputKey);
      await storage.put(expectedKey, Buffer.from(input.expectedOutput, "utf8"));
      storedKeys.push(expectedKey);
      created = await prisma.testCase.create({
        data: {
          id: testCaseId,
          problemId,
          kind: input.kind,
          inputRef: inputKey,
          expectedOutputRef: expectedKey,
          sequence: input.sequence,
          weight: input.weight,
          comparisonConfig: input.comparisonConfig,
          enabled: input.enabled,
        },
      });
    } catch (error) {
      const cleanupFailures = await removeStoredFiles(storedKeys);
      if (cleanupFailures.length) {
        console.error("Failed to clean up private test-case data after creation failure.", { problemId, testCaseId, failureCount: cleanupFailures.length });
      }
      throw error;
    }
    res.status(201).json({ data: testCaseMetadata(created) });
  } catch (error) { next(error); }
});

router.patch("/test-cases/:testCaseId", async (req, res, next) => {
  let newKeys = [];
  try {
    const testCaseId = uuidSchema.parse(req.params.testCaseId);
    const input = testCaseUpdateSchema.parse(req.body);
    const prisma = getPrisma();
    const existing = await prisma.testCase.findUnique({ where: { id: testCaseId } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Test case not found." } });

    const inputRef = input.input !== undefined ? storageKey(existing.problemId, testCaseId, "input") : existing.inputRef;
    const expectedOutputRef = input.expectedOutput !== undefined ? storageKey(existing.problemId, testCaseId, "expected") : existing.expectedOutputRef;
    let updated;
    try {
      if (input.input !== undefined) {
        await storage.put(inputRef, Buffer.from(input.input, "utf8"));
        newKeys.push(inputRef);
      }
      if (input.expectedOutput !== undefined) {
        await storage.put(expectedOutputRef, Buffer.from(input.expectedOutput, "utf8"));
        newKeys.push(expectedOutputRef);
      }
      updated = await prisma.testCase.update({
        where: { id: testCaseId },
        data: {
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
          ...(input.comparisonConfig !== undefined ? { comparisonConfig: input.comparisonConfig } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.input !== undefined ? { inputRef } : {}),
          ...(input.expectedOutput !== undefined ? { expectedOutputRef } : {}),
        },
      });
    } catch (error) {
      const cleanupFailures = await removeStoredFiles(newKeys);
      if (cleanupFailures.length) {
        console.error("Failed to clean up staged private test-case data after update failure.", { testCaseId, failureCount: cleanupFailures.length });
      }
      throw error;
    }
    const obsoleteKeys = [
      ...(input.input !== undefined ? [existing.inputRef] : []),
      ...(input.expectedOutput !== undefined ? [existing.expectedOutputRef] : []),
    ];
    const cleanupFailures = await removeStoredFiles(obsoleteKeys);
    const warning = cleanupFailures.length ? "Updated, but obsolete private test-case data could not be removed." : null;
    if (warning) {
      console.error("Failed to remove obsolete private test-case data after update.", { testCaseId, failureCount: cleanupFailures.length });
    }
    res.json({ data: testCaseMetadata(updated), ...(warning ? { warning } : {}) });
  } catch (error) { next(error); }
});

module.exports = router;
