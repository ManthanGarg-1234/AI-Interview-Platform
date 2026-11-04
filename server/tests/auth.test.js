"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../index");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("unauthenticated requests are rejected and public admin registration is rejected", async () => {
  const unauthenticated = await fetch(`${origin}/api/v1/auth/me`);
  assert.equal(unauthenticated.status, 401);
  const admin = await fetch(`${origin}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Platform Admin", email: "admin@example.test", password: "A-secure-password-123", role: "ADMIN" }),
  });
  assert.equal(admin.status, 400);
});

test("state-changing requests require CSRF protection", async () => {
  const logout = await fetch(`${origin}/api/v1/auth/logout`, { method: "POST" });
  assert.equal(logout.status, 403);
});

test("all student profile and resume surfaces reject unauthenticated access", async () => {
  const paths = [
    "/api/v1/me/profile",
    "/api/v1/me/education",
    "/api/v1/me/projects",
    "/api/v1/me/experience",
    "/api/v1/me/certifications",
    "/api/v1/me/skills",
    "/api/v1/me/resumes",
    "/api/v1/me/resume-versions/not-a-real-version/download",
    "/api/v1/me/interviews",
    "/api/v1/me/interviews/dashboard",
    "/api/v1/me/assessments",
    "/api/v1/me/assessments/assignments",
    "/api/v1/me/assessments/attempts",
    "/api/v1/me/notifications",
    "/api/v1/me/notifications/preferences",
    "/api/v1/admin/dashboard",
    "/api/v1/recruiter/dashboard",
  ];
  for (const path of paths) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 401, path);
  }
});
