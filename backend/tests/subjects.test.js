"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");
const { requireRole } = require("../auth");

let prisma;
prismaModule.getPrisma = () => prisma;
const { adminRouter, studentRouter, updateTopicProgress } = require("../subjects");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/subjects", (req, _res, next) => {
    const role = req.get("x-role") || "STUDENT";
    req.user = { role };
    req.auth = { sub: role === "ADMIN" ? "admin-user" : "student-user" };
    next();
  }, adminRouter, studentRouter);
  app.post("/subjects/:subjectSlug/topics/:topicSlug/progress", requireRole("STUDENT"), updateTopicProgress);
  app.use((error, _req, res, _next) => res.status(error.status || (error.name === "ZodError" ? 400 : 500)).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("student learning progress route returns the authenticated profile's progress", async () => {
  let progressWhere;
  prisma = {
    studentProfile: { findUnique: async ({ where }) => ({ id: where.userId === "student-user" ? "profile-1" : null }) },
    learningProgress: { findMany: async ({ where }) => { progressWhere = where; return [{ topicId: "topic-1" }]; } },
  };

  const response = await fetch(`${origin}/subjects/me/progress`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [{ topicId: "topic-1" }] });
  assert.deepEqual(progressWhere, { studentProfileId: "profile-1" });
});

test("subject and topic creation is admin-only and uses the public subjects routes", async () => {
  const topicCalls = [];
  prisma = {
    subject: { create: async ({ data }) => ({ id: "subject-1", ...data }) },
    topic: { create: async ({ data }) => { topicCalls.push(data); return { id: "topic-1", ...data }; } },
  };

  for (const path of ["/subjects/subjects", "/subjects/subject-1/topics"]) {
    const denied = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(path.endsWith("/topics")
        ? { name: "Arrays", slug: "arrays" }
        : { name: "Algorithms", slug: "algorithms" }),
    });
    assert.equal(denied.status, 403);
  }

  const createdSubject = await fetch(`${origin}/subjects/subjects`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "ADMIN" },
    body: JSON.stringify({ name: "Algorithms", slug: "algorithms" }),
  });
  assert.equal(createdSubject.status, 201);
  assert.deepEqual((await createdSubject.json()).data, { id: "subject-1", name: "Algorithms", slug: "algorithms", status: "PUBLISHED" });

  const createdTopic = await fetch(`${origin}/subjects/subject-1/topics`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "ADMIN" },
    body: JSON.stringify({ name: "Arrays", slug: "arrays" }),
  });
  assert.equal(createdTopic.status, 201);
  assert.deepEqual((await createdTopic.json()).data, { id: "topic-1", name: "Arrays", slug: "arrays", subjectId: "subject-1" });
  assert.deepEqual(topicCalls, [{ name: "Arrays", slug: "arrays", subjectId: "subject-1" }]);
});

test("topic progress and its activity are persisted in one transaction without invented partial progress", async () => {
  const operations = [];
  prisma = {
    topic: { findFirst: async () => ({ id: "topic-1", subjectId: "subject-1" }) },
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    $transaction: async (callback) => callback({
      learningProgress: {
        findFirst: async ({ where }) => { operations.push({ type: "find-progress", where }); return null; },
        create: async ({ data }) => { operations.push({ type: "progress", data }); return { id: "progress-1", ...data }; },
      },
      studentActivity: {
        create: async ({ data }) => { operations.push({ type: "activity", data }); },
      },
    }),
  };

  const response = await fetch(`${origin}/subjects/dsa/topics/arrays/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });

  assert.equal(response.status, 200);
  assert.equal(operations.length, 3);
  assert.equal(operations[0].type, "find-progress");
  assert.deepEqual(operations[0].where, { studentProfileId: "profile-1", topicId: "topic-1" });
  assert.equal(operations[1].type, "progress");
  assert.deepEqual(operations[1].data, { studentProfileId: "profile-1", topicId: "topic-1", status: "IN_PROGRESS", percent: 0, lastActivityAt: operations[1].data.lastActivityAt });
  assert.equal(operations[2].type, "activity");
  assert.deepEqual(operations[2].data, { studentProfileId: "profile-1", activityType: "TOPIC_PROGRESS", topicId: "topic-1", metadata: { status: "IN_PROGRESS" } });
  assert.ok(operations[1].data.lastActivityAt instanceof Date);
});

test("restarting an existing topic updates its progress row", async () => {
  const operations = [];
  prisma = {
    topic: { findFirst: async () => ({ id: "topic-1", subjectId: "subject-1" }) },
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    $transaction: async (callback) => callback({
      learningProgress: {
        findFirst: async () => ({ id: "existing-progress" }),
        update: async ({ where, data }) => { operations.push({ where, data }); return { id: where.id, ...data }; },
      },
      studentActivity: { create: async () => ({}) },
    }),
  };
  const response = await fetch(`${origin}/subjects/dsa/topics/arrays/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  assert.equal(response.status, 200);
  assert.equal(operations[0].where.id, "existing-progress");
  assert.equal(operations[0].data.status, "COMPLETED");
  assert.equal(operations[0].data.percent, 100);
});

test("students cannot open unpublished subject content by guessing its slug", async () => {
  let where;
  prisma = { subject: { findUnique: async (args) => { where = args.where; return null; } } };

  const response = await fetch(`${origin}/subjects/private-draft`);

  assert.equal(response.status, 404);
  assert.deepEqual(where, { slug: "private-draft", status: "PUBLISHED" });
});
