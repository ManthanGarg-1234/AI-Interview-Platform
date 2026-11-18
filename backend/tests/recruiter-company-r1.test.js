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
const users = [];
const companies = [];

function pairs(response) { return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; "); }
function csrf(cookie) { return decodeURIComponent(cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/)?.[1] || ""); }
async function user(prefix) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`;
  const record = await prisma.user.create({ data: { email, emailNormalized: email, fullName: prefix, passwordHash: await hashPassword(password), role: "RECRUITER", status: "ACTIVE", emailVerifiedAt: new Date() } });
  users.push(record.id);
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: frontendOrigin }, body: JSON.stringify({ email, password }) });
  return { record, cookie: pairs(login) };
}
async function request(cookie, path, { method = "GET", body } = {}) {
  const headers = { origin: frontendOrigin, cookie };
  if (method !== "GET") headers["x-csrf-token"] = csrf(cookie);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, json: await response.json().catch(() => null) };
}
const base = { name: "XYZ", description: "A company description long enough for validation.", officialEmailDomain: "xyz.com", metadata: { socialLinks: { linkedin: "https://linkedin.com/xyz", x: "https://x.com/xyz", careers: "https://careers.xyz.com" } } };

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await prisma.job.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.companyMember.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test("company create and update normalize schemeless website and return field paths", async () => {
  const recruiter = await user("r1-company-owner");
  const created = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { ...base, website: " XYZ.in " } });
  assert.equal(created.response.status, 201);
  companies.push(created.json.data.id);
  assert.equal(created.json.data.website, "https://xyz.in");
  const updated = await request(recruiter.cookie, `/recruiter/companies/${created.json.data.id}`, { method: "PATCH", body: { website: "XYZ.in" } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.json.data.website, "https://xyz.in");
  const invalid = await request(recruiter.cookie, `/recruiter/companies/${created.json.data.id}`, { method: "PATCH", body: { website: "javascript:alert(1)" } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.json.error.details[0].path, "website");
});

test("company rejects unsafe website, logo, and social schemes and enforces domains", async () => {
  const recruiter = await user("r1-company-validation");
  for (const field of ["website", "logoUrl"]) {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com"]) {
      const result = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { ...base, [field]: value } });
      assert.equal(result.response.status, 400, `${field} ${value}`);
    }
  }
  for (const key of ["linkedin", "x", "careers"]) {
    const result = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { ...base, metadata: { socialLinks: { [key]: "javascript:alert(1)" } } } });
    assert.equal(result.response.status, 400, key);
  }
  for (const domain of ["@xyz.com", "http://xyz.com"]) {
    const result = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { ...base, officialEmailDomain: domain } });
    assert.equal(result.response.status, 400, domain);
  }
  const accepted = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { ...base, name: "Domain Accepted", officialEmailDomain: "xyz.com" } });
  assert.equal(accepted.response.status, 201);
  companies.push(accepted.json.data.id);
});

test("company update is scoped to owners and hiring managers", async () => {
  const owner = await user("r1-owner");
  const outsider = await user("r1-outsider");
  const reviewer = await user("r1-reviewer");
  const company = await prisma.company.create({ data: { name: "Scoped Company" } });
  companies.push(company.id);
  await prisma.companyMember.createMany({ data: [{ companyId: company.id, userId: owner.record.id, role: "OWNER" }, { companyId: company.id, userId: reviewer.record.id, role: "REVIEWER" }] });
  const forbidden = await request(reviewer.cookie, `/recruiter/companies/${company.id}`, { method: "PATCH", body: { name: "Nope" } });
  assert.equal(forbidden.response.status, 403);
  const notFound = await request(outsider.cookie, `/recruiter/companies/${company.id}`, { method: "PATCH", body: { name: "Nope" } });
  assert.equal(notFound.response.status, 403);
});

test("dashboard exposes onboarding completion data", async () => {
  const recruiter = await user("r1-onboarding");
  const before = await request(recruiter.cookie, "/recruiter/dashboard");
  assert.equal(before.response.status, 200);
  assert.deepEqual(before.json.data.onboarding, { company: false, job: false, teammate: false, applicants: false });
  const company = await prisma.company.create({ data: { name: "Onboarding Company" } });
  companies.push(company.id);
  await prisma.companyMember.create({ data: { companyId: company.id, userId: recruiter.record.id, role: "OWNER" } });
  await prisma.job.create({ data: { companyId: company.id, createdByUserId: recruiter.record.id, title: "First role", description: "A first role description long enough.", employmentType: "FULL_TIME", status: "DRAFT" } });
  const after = await request(recruiter.cookie, "/recruiter/dashboard");
  assert.deepEqual(after.json.data.onboarding, { company: true, job: true, teammate: false, applicants: false });
});
