"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const app = require("../index");
const { getPrisma } = require("../prisma");
const { problemIdentifierWhere } = require("../coding");

let server;
let origin;
let cookie;
const email = `coding-test-${crypto.randomUUID()}@example.test`;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Coding Test", email, password: "A-secure-password-123", role: "STUDENT" }),
  });
  assert.equal(response.status, 201);
  cookie = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
});

test.after(async () => {
  await getPrisma().user.deleteMany({ where: { email } });
  await new Promise((resolve) => server.close(resolve));
});

test("problem identifiers select only the UUID or slug field", () => {
  assert.deepEqual(problemIdentifierWhere("29ca3668-65b3-490e-b0ae-37d4ff6c3437"), { id: "29ca3668-65b3-490e-b0ae-37d4ff6c3437" });
  assert.deepEqual(problemIdentifierWhere("pair-with-target-sum"), { slug: "pair-with-target-sum" });
  assert.deepEqual(problemIdentifierWhere("not-a-valid-problem"), { slug: "not-a-valid-problem" });
});

test("problem detail and starter code resolve by slug and UUID", async () => {
  const headers = { cookie };
  const bySlug = await fetch(`${origin}/api/v1/coding/problems/pair-with-target-sum`, { headers });
  assert.equal(bySlug.status, 200);
  assert.equal((await bySlug.json()).data.slug, "pair-with-target-sum");

  const byUuid = await fetch(`${origin}/api/v1/coding/problems/29ca3668-65b3-490e-b0ae-37d4ff6c3437`, { headers });
  assert.equal(byUuid.status, 200);
  assert.equal((await byUuid.json()).data.id, "29ca3668-65b3-490e-b0ae-37d4ff6c3437");

  const starter = await fetch(`${origin}/api/v1/coding/problems/pair-with-target-sum/starter-code?language=Java`, { headers });
  assert.equal(starter.status, 200);
  assert.equal((await starter.json()).data.language, "Java");
});

test("invalid problem identifiers return not found and protected endpoints reject anonymous users", async () => {
  const invalid = await fetch(`${origin}/api/v1/coding/problems/not-a-real-problem`);
  assert.equal(invalid.status, 401);

  const missing = await fetch(`${origin}/api/v1/coding/problems/not-a-real-problem`, { headers: { cookie } });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
});
