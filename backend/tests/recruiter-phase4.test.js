"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const app = require("../index");
const { getPrisma } = require("../prisma");
const { hashPassword } = require("../services/password");
const { closeAuthRateLimitRedis } = require("../middleware/auth-rate-limit");

const prisma = getPrisma();
const password = "Valid-Passphrase-2030!";
const frontendOrigin = new URL(process.env.FRONTEND_ORIGIN || "http://localhost:5173").origin;
let server;
let origin;
const userIds = [];
let recruiter;
let otherRecruiter;
let student;
let company;
let otherCompany;
let job;

function cookiePairs(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; ");
}
function csrfToken(cookie) {
  const match = cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}
async function createUser(role, prefix) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`;
  const user = await prisma.user.create({ data: { email, emailNormalized: email, fullName: `${prefix} Test`, passwordHash: await hashPassword(password), role, status: "ACTIVE", emailVerifiedAt: new Date() } });
  userIds.push(user.id);
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: frontendOrigin }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  return { user, cookie: cookiePairs(login) };
}
async function request(cookie, path, { method = "GET", body } = {}) {
  const headers = { origin: frontendOrigin, cookie };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["x-csrf-token"] = csrfToken(cookie);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, json: await response.json().catch(() => null) };
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  recruiter = await createUser("RECRUITER", "phase4-recruiter");
  otherRecruiter = await createUser("RECRUITER", "phase4-other-recruiter");
  student = await createUser("STUDENT", "phase4-student");
  company = await prisma.company.create({ data: { name: `Phase4 Company ${crypto.randomUUID()}`, status: "VERIFIED", verifiedAt: new Date() } });
  otherCompany = await prisma.company.create({ data: { name: `Phase4 Other ${crypto.randomUUID()}`, status: "VERIFIED", verifiedAt: new Date() } });
  await prisma.companyMember.create({ data: { companyId: company.id, userId: recruiter.user.id, role: "HIRING_MANAGER", active: true } });
  await prisma.companyMember.create({ data: { companyId: otherCompany.id, userId: otherRecruiter.user.id, role: "HIRING_MANAGER", active: true } });
  job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: recruiter.user.id, title: "Phase4 Engineer", description: "Original description that is long enough.", employmentType: "FULL_TIME", status: "DRAFT" } });
});

test.after(async () => {
  await prisma.applicationStageHistory.deleteMany({ where: { changedByUserId: { in: userIds } } });
  await prisma.offer.deleteMany({ where: { studentUserId: { in: userIds } } });
  await prisma.application.deleteMany({ where: { studentUserId: { in: userIds } } });
  await prisma.job.deleteMany({ where: { companyId: { in: [company?.id, otherCompany?.id].filter(Boolean) } } });
  await prisma.companyMember.deleteMany({ where: { companyId: { in: [company?.id, otherCompany?.id].filter(Boolean) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { resourceId: { in: userIds } }] } });
  await prisma.company.deleteMany({ where: { id: { in: [company?.id, otherCompany?.id].filter(Boolean) } } });
  await prisma.securityEvent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test("job edit authorizes company access, validates input, and writes a change-history audit entry", async () => {
  const unauthorized = await request(otherRecruiter.cookie, `/recruiter/jobs/${job.id}`, { method: "PATCH", body: { title: "Unauthorized" } });
  assert.equal(unauthorized.response.status, 404);

  const changed = await request(recruiter.cookie, `/recruiter/jobs/${job.id}`, { method: "PATCH", body: { title: "Updated Phase4 Engineer", location: "Remote" } });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.json.data.title, "Updated Phase4 Engineer");
  assert.equal(await prisma.auditLog.count({ where: { action: "JOB_EDITED", resourceType: "JOB", resourceId: job.id, actorUserId: recruiter.user.id } }), 1);

  const invalid = await request(recruiter.cookie, `/recruiter/jobs/${job.id}`, { method: "PATCH", body: { title: "" } });
  assert.equal(invalid.response.status, 400);
});

test("job status actions enforce valid transitions", async () => {
  const paused = await request(recruiter.cookie, `/recruiter/jobs/${job.id}/pause`, { method: "POST" });
  assert.equal(paused.response.status, 409);
  assert.equal(paused.json.error.code, "INVALID_JOB_TRANSITION");

  const published = await request(recruiter.cookie, `/recruiter/jobs/${job.id}/publish`, { method: "POST" });
  assert.equal(published.response.status, 200);
  assert.equal(published.json.data.status, "PUBLISHED");
  assert.equal(await prisma.auditLog.count({ where: { action: "JOB_PUBLISH", resourceType: "JOB", resourceId: job.id } }), 1);
});

test("invalid application stages are refused and HIRED requires an accepted offer", async () => {
  const application = await prisma.application.create({ data: { jobId: job.id, studentUserId: student.user.id, status: "OFFER_RELEASED", consentSnapshot: { termsAccepted: true } } });
  const invalid = await request(recruiter.cookie, `/recruiter/applications/${application.id}/status`, { method: "PATCH", body: { status: "HIRED" } });
  assert.equal(invalid.response.status, 409);
  assert.equal(invalid.json.error.code, "HIRED_OFFER_REQUIRED");

  await prisma.offer.create({ data: { applicationId: application.id, jobId: job.id, studentUserId: student.user.id, createdByUserId: recruiter.user.id, designation: "Phase4 Engineer", compensation: { currency: "INR", baseSalary: 1000000 }, joiningDate: new Date(Date.now() + 30 * 86400000), expiresAt: new Date(Date.now() + 86400000), status: "ACCEPTED", respondedAt: new Date() } });
  const hired = await request(recruiter.cookie, `/recruiter/applications/${application.id}/status`, { method: "PATCH", body: { status: "HIRED", reason: "Offer accepted" } });
  assert.equal(hired.response.status, 200);
  assert.equal(hired.json.data.status, "HIRED");
  assert.equal(await prisma.auditLog.count({ where: { action: "APPLICATION_STAGE_MOVED", resourceType: "APPLICATION", resourceId: application.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: student.user.id, resourceType: "APPLICATION", resourceId: application.id } }), 1);
});
