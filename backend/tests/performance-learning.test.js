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
