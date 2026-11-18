"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const prismaModule = require("../prisma");

let prisma;
prismaModule.getPrisma = () => prisma;
process.env.STORAGE_ROOT = path.join(os.tmpdir(), `coding-admin-${crypto.randomUUID()}`);
const storage = require("../private-storage");
const codingAdmin = require("../coding-admin");

let server;
let origin;
const problemId = crypto.randomUUID();

test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use("/admin/coding", codingAdmin);
  app.use((error, _req, res, _next) => {
    const status = error.name === "ZodError" ? 400 : error.status || 500;
    res.status(status).json({ error: error.message });
  });
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(process.env.STORAGE_ROOT, { recursive: true, force: true });
  delete process.env.STORAGE_ROOT;
});

test("test-case creation validates and stores payloads privately", async () => {
  let created;
  prisma = {
    codingProblem: { findUnique: async () => ({ id: problemId }) },
    testCase: { create: async ({ data }) => { created = data; return { ...data, id: "case-id", weight: "2.50" }; } },
  };

  const response = await fetch(`${origin}/admin/coding/problems/${problemId}/test-cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "HIDDEN", input: "secret input", expectedOutput: "secret output", sequence: 4, weight: 2.5 }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).data, {
    id: "case-id",
    kind: "HIDDEN",
    sequence: 4,
    weight: 2.5,
    comparisonConfig: { mode: "TRIM_TRAILING_WHITESPACE" },
    enabled: true,
  });
  assert.equal((await storage.get(created.inputRef)).toString(), "secret input");
  assert.equal((await storage.get(created.expectedOutputRef)).toString(), "secret output");
  assert.doesNotMatch(JSON.stringify(created), /secret input|secret output/);
});

test("invalid test cases are rejected before database access", async () => {
  let queried = false;
  prisma = { codingProblem: { findUnique: async () => { queried = true; } } };
  const response = await fetch(`${origin}/admin/coding/problems/${problemId}/test-cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "HIDDEN", input: "x", expectedOutput: "y", sequence: -1 }),
  });
  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("test-case updates replace private data and remove obsolete storage", async () => {
  const testCaseId = crypto.randomUUID();
  const oldInput = await storage.put(`tests/${testCaseId}-input`, Buffer.from("old input"));
  const oldExpected = await storage.put(`tests/${testCaseId}-expected`, Buffer.from("unchanged expected"));
  let update;
  prisma = {
    testCase: {
      findUnique: async () => ({
        id: testCaseId,
        problemId,
        kind: "HIDDEN",
        sequence: 0,
        weight: "1.00",
        comparisonConfig: { mode: "TRIM_TRAILING_WHITESPACE" },
        enabled: true,
        inputRef: oldInput.key,
        expectedOutputRef: oldExpected.key,
      }),
      update: async ({ data }) => {
        update = data;
        return {
          id: testCaseId,
          kind: "HIDDEN",
          sequence: 0,
          weight: "1.00",
          comparisonConfig: { mode: "TRIM_TRAILING_WHITESPACE" },
          enabled: true,
          ...data,
        };
      },
    },
  };

  const response = await fetch(`${origin}/admin/coding/test-cases/${testCaseId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "new input" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await storage.get(update.inputRef)).toString(), "new input");
  assert.equal((await storage.get(oldExpected.key)).toString(), "unchanged expected");
  await assert.rejects(storage.get(oldInput.key), { code: "ENOENT" });
});

test("function configuration persists trusted templates without exposing them in response", async () => {
  let problemUpdate;
  let languageUpsert;
  prisma = {
    codingProblem: { findUnique: async () => ({ id: problemId }) },
    $transaction: async (callback) => callback({
      codingProblem: { update: async ({ data }) => { problemUpdate = data; } },
      problemLanguageConfig: {
        updateMany: async () => {},
        upsert: async ({ create }) => { languageUpsert = create; },
      },
    }),
  };
  const harnessTemplate = "trusted runtime\n{{USER_CODE}}\ntrusted invocation";
  const response = await fetch(`${origin}/admin/coding/problems/${problemId}/configuration`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      executionMode: "FUNCTION_BASED",
      functionName: "solve",
      parameterDefinitions: [{ name: "value", type: "integer" }],
      returnType: "integer",
      inputSerializationFormat: "JSON",
      outputSerializationFormat: "JSON",
      languageConfigs: [{ language: "Python", starterCode: "", functionSignature: "solve(value)", harnessTemplate }],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(problemUpdate.executionMode, "FUNCTION_BASED");
  assert.equal(languageUpsert.harnessTemplate, harnessTemplate);
  assert.doesNotMatch(JSON.stringify(await response.json()), /trusted runtime|trusted invocation/);
});

test("incomplete function configuration is rejected before database access", async () => {
  let queried = false;
  prisma = { codingProblem: { findUnique: async () => { queried = true; } } };
  const response = await fetch(`${origin}/admin/coding/problems/${problemId}/configuration`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      executionMode: "FUNCTION_BASED",
      functionName: "solve",
      languageConfigs: [{ language: "Python", starterCode: "" }],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(queried, false);
});
