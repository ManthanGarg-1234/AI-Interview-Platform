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
async function upload(cookie, path, name, type, buffer) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  const response = await fetch(`${origin}/api/v1${path}`, { method: "POST", headers: { origin: frontendOrigin, cookie, "x-csrf-token": csrf(cookie) }, body: form });
  return { response, json: await response.json().catch(() => null) };
}
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await prisma.storedFile.deleteMany({ where: { ownerUserId: { in: users } } });
  await prisma.companyMember.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});
const png = Buffer.from("89504e470d0a1a0a", "hex");
const jpg = Buffer.from("ffd8ffe000104a4649460001", "hex");
const webp = Buffer.from("524946460000000057454250", "hex");

test("logo upload validates signatures, size, and persists as pending scanned storage", async () => {
  const recruiter = await user("r1-logo-owner");
  const company = await prisma.company.create({ data: { name: "Logo Company" } });
  companies.push(company.id);
  await prisma.companyMember.create({ data: { companyId: company.id, userId: recruiter.record.id, role: "OWNER" } });
  for (const [name, type, bytes] of [["logo.png", "image/png", png], ["logo.jpg", "image/jpeg", jpg], ["logo.webp", "image/webp", webp]]) {
    const result = await upload(recruiter.cookie, `/recruiter/companies/${company.id}/logo`, name, type, bytes);
    assert.equal(result.response.status, 201, name);
    const stored = await prisma.storedFile.findFirst({ where: { ownerUserId: recruiter.record.id, originalName: name } });
    assert.equal(stored.scanStatus, "PENDING");
    assert.equal(stored.retentionClass, "MODERATION_EVIDENCE");
  }
  assert.equal((await upload(recruiter.cookie, `/recruiter/companies/${company.id}/logo`, "fake.png", "image/png", Buffer.from("not png"))).response.status, 400);
  assert.equal((await upload(recruiter.cookie, `/recruiter/companies/${company.id}/logo`, "logo.svg", "image/svg+xml", Buffer.from("<svg/>"))).response.status, 400);
  assert.equal((await upload(recruiter.cookie, `/recruiter/companies/${company.id}/logo`, "large.png", "image/png", Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))).response.status, 413);
});

test("logo upload authorization returns 404 for outsiders and refuses non-owners", async () => {
  const owner = await user("r1-logo-auth-owner");
  const outsider = await user("r1-logo-auth-outsider");
  const reviewer = await user("r1-logo-auth-reviewer");
  const company = await prisma.company.create({ data: { name: "Logo Auth Company" } });
  companies.push(company.id);
  await prisma.companyMember.createMany({ data: [{ companyId: company.id, userId: owner.record.id, role: "OWNER" }, { companyId: company.id, userId: reviewer.record.id, role: "REVIEWER" }] });
  assert.equal((await upload(outsider.cookie, `/recruiter/companies/${company.id}/logo`, "logo.png", "image/png", png)).response.status, 404);
  assert.equal((await upload(reviewer.cookie, `/recruiter/companies/${company.id}/logo`, "logo.png", "image/png", png)).response.status, 403);
});
