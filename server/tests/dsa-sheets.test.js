"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");

let prisma;
prismaModule.getPrisma = () => prisma;
const { studentRouter, adminRouter } = require("../dsa-sheets");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/dsa-sheets", (req, _res, next) => { req.auth = { sub: "student-1" }; next(); }, studentRouter);
  app.use("/admin/dsa-sheets", (req, _res, next) => { req.auth = { sub: "admin-1" }; next(); }, adminRouter);
  app.use((error, _req, res, _next) => res.status(error.name === "ZodError" ? 400 : 500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("published sheet listing calculates progress only for the authenticated student", async () => {
  let query;
  prisma = {
    dSASheet: {
      findMany: async (args) => {
        query = args;
        return [{
          id: "sheet-1",
          name: "DSA Roadmap",
          problems: [
            { progress: [{ status: "SOLVED" }] },
            { progress: [{ status: "ATTEMPTED" }] },
            { progress: [] },
          ],
        }];
      },
    },
  };

  const response = await fetch(`${origin}/dsa-sheets`);

  assert.equal(response.status, 200);
  assert.equal(query.where.status, "PUBLISHED");
  assert.deepEqual(query.include.problems.include.progress.where, { userId: "student-1" });
  assert.deepEqual(await response.json(), {
    data: [{ id: "sheet-1", name: "DSA Roadmap", total: 3, completed: 1, attempted: 1 }],
  });
});

test("student progress updates are scoped by sheet and authenticated user", async () => {
  let lookup;
  let upsert;
  prisma = {
    dSASheetProblem: { findFirst: async (args) => { lookup = args; return { id: "entry-1", sheetId: "sheet-1" }; } },
    dSASheetProgress: { upsert: async (args) => { upsert = args; return { id: "progress-1", ...args.create }; } },
  };

  const response = await fetch(`${origin}/dsa-sheets/roadmap/problems/entry-1/progress`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "SOLVED", notes: "Review binary search bounds" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(lookup.where, { id: "entry-1", sheet: { slug: "roadmap", status: "PUBLISHED" } });
  assert.deepEqual(upsert.where, { sheetProblemId_userId: { sheetProblemId: "entry-1", userId: "student-1" } });
  assert.deepEqual(upsert.create, {
    sheetId: "sheet-1",
    sheetProblemId: "entry-1",
    userId: "student-1",
    status: "SOLVED",
    notes: "Review binary search bounds",
    solvedAt: upsert.create.solvedAt,
  });
  assert.ok(upsert.create.solvedAt instanceof Date);
});

test("invalid sheet progress is rejected before database access", async () => {
  let queried = false;
  prisma = { dSASheetProblem: { findFirst: async () => { queried = true; } } };

  const response = await fetch(`${origin}/dsa-sheets/roadmap/problems/entry-1/progress`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "MASTERY", notes: "x".repeat(2001) }),
  });

  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("admin import preview reports duplicates and unresolved mappings", async () => {
  prisma = {
    codingProblem: { findFirst: async ({ where }) => where.slug === "known-problem" ? { id: "problem-1" } : null },
  };

  const response = await fetch(`${origin}/admin/dsa-sheets/import/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Interview sheet",
      slug: "interview-sheet",
      problems: [
        { title: "Known", problemSlug: "known-problem" },
        { title: "Unknown", problemSlug: "missing-problem" },
        { title: "Duplicate", problemSlug: "known-problem" },
      ],
    }),
  });

  assert.equal(response.status, 200);
  const result = (await response.json()).data;
  assert.equal(result.valid, false);
  assert.deepEqual(result.problems.map(({ mapped, duplicate, valid }) => ({ mapped, duplicate, valid })), [
    { mapped: true, duplicate: false, valid: true },
    { mapped: false, duplicate: false, valid: false },
    { mapped: true, duplicate: true, valid: false },
  ]);
});

test("admin import requires explicit confirmation and writes sheet and entries transactionally", async () => {
  let created;
  let entries;
  let txCalls = 0;
  prisma = {
    codingProblem: { findFirst: async () => ({ id: "problem-1" }) },
    $transaction: async (callback) => {
      txCalls += 1;
      return callback({
        dSASheet: { create: async ({ data }) => { created = data; return { id: "sheet-1", ...data }; } },
        dSASheetProblem: { createMany: async ({ data }) => { entries = data; } },
      });
    },
  };
  const body = {
    name: "CareerPrepAI Roadmap",
    slug: "careerprepai-roadmap",
    problems: [{ title: "Known", problemSlug: "known-problem", platform: "CareerPrepAI" }],
  };

  const withoutConfirmation = await fetch(`${origin}/admin/dsa-sheets/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(withoutConfirmation.status, 400);
  assert.equal(txCalls, 0);

  const response = await fetch(`${origin}/admin/dsa-sheets/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, confirm: true }),
  });

  assert.equal(response.status, 201);
  assert.equal(txCalls, 1);
  assert.equal(created.slug, body.slug);
  assert.deepEqual(entries, [{
    title: "Known",
    difficulty: null,
    topic: null,
    platform: "CareerPrepAI",
    externalUrl: null,
    problemId: "problem-1",
    sequence: 1,
    sheetId: "sheet-1",
  }]);
});
