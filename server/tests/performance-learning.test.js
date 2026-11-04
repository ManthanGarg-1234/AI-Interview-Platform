"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");

let prisma;
prismaModule.getPrisma = () => prisma;
const performance = require("../performance");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/me", (req, _res, next) => { req.auth = { sub: "student-1" }; next(); }, performance);
  app.use((error, _req, res, _next) => res.status(error.name === "ZodError" ? 400 : error.status || 500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("resource library returns per-student progress and filters by kind", async () => {
  let query;
  prisma = {
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    learningResource: {
      findMany: async (args) => {
        query = args;
        return [{ id: "resource-1", title: "Graph basics", kind: "ARTICLE", progress: [{ status: "COMPLETED", percent: 100 }] }];
      },
    },
  };

  const response = await fetch(`${origin}/me/resources?kind=ARTICLE&search=Graph`);
  assert.equal(response.status, 200);
  assert.deepEqual(query.where, { status: "PUBLISHED", title: { contains: "Graph", mode: "insensitive" }, kind: "ARTICLE" });
  assert.deepEqual(query.include.progress.where, { studentProfileId: "profile-1" });
  assert.deepEqual((await response.json()).data[0].progress, { status: "COMPLETED", percent: 100 });
});

test("resource progress creates a row without nullable compound-key upsert", async () => {
  let created;
  prisma = {
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    learningResource: { findFirst: async () => ({ id: "resource-1", topicId: null }) },
    $transaction: async (callback) => callback({
      learningProgress: {
        findFirst: async () => null,
        create: async ({ data }) => { created = data; return { id: "progress-1", ...data }; },
      },
    }),
  };

  const response = await fetch(`${origin}/me/resources/resource-1/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ percent: 100 }),
  });
  assert.equal(response.status, 200);
  assert.equal(created.studentProfileId, "profile-1");
  assert.equal(created.resourceId, "resource-1");
  assert.equal(created.topicId, null);
  assert.equal(created.status, "COMPLETED");
});

test("study plan creation persists its goals and tasks in one transaction", async () => {
  const operations = [];
  prisma = {
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    $transaction: async (callback) => callback({
      studyPlan: {
        create: async ({ data }) => { operations.push({ type: "plan", data }); return { id: "plan-1" }; },
        findUnique: async () => ({ id: "plan-1", targetRole: "Backend developer", goals: [], tasks: [] }),
      },
      studyGoal: { findMany: async () => [{ id: "goal-1", title: "Practice SQL", priority: "HIGH" }] },
      studyTask: { createMany: async ({ data }) => { operations.push({ type: "tasks", data }); } },
    }),
  };
  const response = await fetch(`${origin}/me/plans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetRole: "Backend developer", dailyMinutes: 45, goals: ["Practice SQL"] }),
  });
  assert.equal(response.status, 201);
  assert.equal(operations[0].data.goals.create[0].title, "Practice SQL");
  assert.equal(operations[1].data[0].goalId, "goal-1");
  assert.equal(operations[1].data[0].status, "OPEN");
});

test("completing the final study task completes its goal and plan atomically", async () => {
  const operations = [];
  prisma = {
    studentProfile: { findUnique: async () => ({ id: "profile-1" }) },
    studyTask: { findFirst: async () => ({ id: "task-1", goalId: "goal-1" }) },
    $transaction: async (callback) => callback({
      studyTaskCompletion: { upsert: async () => ({ id: "completion-1" }) },
      studyTask: {
        update: async () => { operations.push("task"); },
        count: async () => 0,
      },
      studyGoal: { update: async () => { operations.push("goal"); } },
      studyPlan: { update: async () => { operations.push("plan"); } },
    }),
  };
  const response = await fetch(`${origin}/me/plans/plan-1/tasks/task-1/complete`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.deepEqual(operations, ["task", "goal", "plan"]);
});

test("AI mentor returns explicit local guidance when the configured provider fails", async () => {
  const priorUrl = process.env.LLM_API_URL;
  const priorKey = process.env.LLM_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.LLM_API_URL = "https://provider.invalid/v1";
  process.env.LLM_API_KEY = "test-key";
  globalThis.fetch = async (input, options) => (
    String(input) === "https://provider.invalid/v1"
      ? { ok: false, status: 503 }
      : priorFetch(input, options)
  );
  const messages = [];
  prisma = {
    studentProfile: { findUnique: async () => { throw Object.assign(new Error("Performance tables unavailable."), { code: "P2021" }); } },
    aiConversation: {
      create: async ({ data }) => {
        messages.push({ id: "message-1", conversationId: "conversation-1", ...data.messages.create });
        return { id: "conversation-1" };
      },
    },
    aiMessage: {
      create: async ({ data }) => {
        const message = { id: `message-${messages.length + 1}`, ...data };
        messages.push(message);
        return message;
      },
      findMany: async () => messages,
    },
  };

  try {
    const response = await fetch(`${origin}/me/mentor/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Explain dynamic programming with examples" }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.data.provider, "local-fallback");
    assert.equal(body.data.contextStatus, "UNAVAILABLE");
    assert.match(body.data.messages[1].content, /temporarily unavailable/);
    assert.match(body.data.messages[1].content, /dynamic programming/);
  } finally {
    if (priorUrl === undefined) delete process.env.LLM_API_URL;
    else process.env.LLM_API_URL = priorUrl;
    if (priorKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = priorKey;
    globalThis.fetch = priorFetch;
  }
});
