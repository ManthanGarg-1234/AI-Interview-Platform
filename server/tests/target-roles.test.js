"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");

let prisma;
prismaModule.getPrisma = () => prisma;
const { studentRouter, adminRouter } = require("../target-roles");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/target-roles", (req, _res, next) => { req.auth = { sub: "student-1" }; next(); }, studentRouter);
  app.use("/admin/target-roles", (req, _res, next) => { req.auth = { sub: "admin-1" }; next(); }, adminRouter);
  app.use((error, _req, res, _next) => res.status(error.name === "ZodError" ? 400 : 500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("target role choices expose only published roles", async () => {
  let where;
  prisma = { targetRole: { findMany: async (args) => { where = args.where; return [{ slug: "sde" }]; } } };

  const response = await fetch(`${origin}/target-roles`);

  assert.equal(response.status, 200);
  assert.deepEqual(where, { status: "PUBLISHED" });
  assert.deepEqual(await response.json(), { data: [{ slug: "sde" }] });
});

test("first selected role becomes primary and updates are scoped to the current user", async () => {
  const calls = [];
  prisma = {
    targetRole: { findFirst: async ({ where }) => { calls.push({ type: "role", where }); return { id: "role-1" }; } },
    studentTargetRole: { count: async ({ where }) => { calls.push({ type: "count", where }); return 0; } },
    $transaction: async (callback) => callback({
      studentTargetRole: {
        updateMany: async ({ where, data }) => { calls.push({ type: "clear-primary", where, data }); },
        upsert: async ({ where, update, create }) => { calls.push({ type: "upsert", where, update, create }); return { roleId: "role-1", ...create }; },
      },
    }),
  };

  const response = await fetch(`${origin}/target-roles/mine`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleSlug: "sde" }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(calls, [
    { type: "role", where: { slug: "sde", status: "PUBLISHED" } },
    { type: "count", where: { userId: "student-1" } },
    { type: "clear-primary", where: { userId: "student-1" }, data: { isPrimary: false } },
    {
      type: "upsert",
      where: { userId_roleId: { userId: "student-1", roleId: "role-1" } },
      update: { isPrimary: true },
      create: { userId: "student-1", roleId: "role-1", isPrimary: true, goalDate: null },
    },
  ]);
});

test("admin role updates change only submitted fields", async () => {
  let update;
  prisma = {
    targetRole: {
      updateMany: async (args) => { update = args; return { count: 1 }; },
      findUnique: async () => ({ id: "role-1", name: "Backend Developer", slug: "backend" }),
    },
  };

  const response = await fetch(`${origin}/admin/target-roles/role-1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Backend Engineer" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(update, { where: { id: "role-1" }, data: { name: "Backend Engineer" } });
});

test("malformed target role preferences are rejected", async () => {
  let queried = false;
  prisma = { targetRole: { findFirst: async () => { queried = true; return { id: "role-1" }; } } };

  const response = await fetch(`${origin}/target-roles/mine`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleSlug: "../sde", isPrimary: "yes" }),
  });

  assert.equal(response.status, 400);
  assert.equal(queried, false);
});
