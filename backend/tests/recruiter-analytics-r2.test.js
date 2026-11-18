"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const app = require("../index");
const { getPrisma } = require("../prisma");
const { hashPassword } = require("../services/password");
const { closeAuthRateLimitRedis } = require("../middleware/auth-rate-limit");
const { resetAnalyticsRedis } = require("../recruiter");

const prisma = getPrisma();
const password = "Valid-Passphrase-2030!";
const frontendOrigin = new URL(process.env.FRONTEND_ORIGIN || "http://localhost:5173").origin;
let server;
let origin;
const users = [];
const companies = [];
const jobs = [];
const applications = [];

function pairs(response) { return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; "); }
function csrf(cookie) { return decodeURIComponent(cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/)?.[1] || ""); }
async function createUser(prefix) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`;
  const record = await prisma.user.create({ data: { email, emailNormalized: email, fullName: prefix, passwordHash: await hashPassword(password), role: "RECRUITER", status: "ACTIVE", emailVerifiedAt: new Date() } });
  users.push(record.id);
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: frontendOrigin }, body: JSON.stringify({ email, password }) });
  return { record, cookie: pairs(login) };
}
async function request(cookie, path, { method = "GET" } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { origin: frontendOrigin, cookie, ...(method === "GET" ? {} : { "x-csrf-token": csrf(cookie) }) } });
  return { response, text: await response.text() };
}
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.recruiterInterview.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.offer.deleteMany({ where: { jobId: { in: jobs } } });
  await prisma.application.deleteMany({ where: { id: { in: applications } } });
  await prisma.job.deleteMany({ where: { id: { in: jobs } } });
  await prisma.companyMember.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test("dashboard summary and analytics never cross company boundaries", async () => {
  const recruiter = await createUser("r2-scope");
  const own = await prisma.company.create({ data: { name: "Own R2 Company" } });
  const other = await prisma.company.create({ data: { name: "Other R2 Company" } });
  companies.push(own.id, other.id);
  await prisma.companyMember.create({ data: { companyId: own.id, userId: recruiter.record.id, role: "OWNER" } });
  const ownJob = await prisma.job.create({ data: { companyId: own.id, createdByUserId: recruiter.record.id, title: "Own role", description: "A sufficiently long own role description.", employmentType: "FULL_TIME" } });
  const otherJob = await prisma.job.create({ data: { companyId: other.id, createdByUserId: recruiter.record.id, title: "Other role", description: "A sufficiently long other role description.", employmentType: "FULL_TIME" } });
  jobs.push(ownJob.id, otherJob.id);
  const student = await prisma.user.create({ data: { email: `r2-student-${crypto.randomUUID()}@example.test`, emailNormalized: `r2-student-${crypto.randomUUID()}@example.test`, fullName: "R2 Student", role: "STUDENT", status: "ACTIVE", emailVerifiedAt: new Date() } });
  users.push(student.id);
  const ownApplication = await prisma.application.create({ data: { jobId: ownJob.id, studentUserId: student.id, status: "APPLIED", consentSnapshot: {}, appliedAt: new Date() } });
  const otherApplication = await prisma.application.create({ data: { jobId: otherJob.id, studentUserId: student.id, status: "HIRED", consentSnapshot: {}, appliedAt: new Date() } });
  applications.push(ownApplication.id, otherApplication.id);
  await prisma.recruiterInterview.createMany({ data: [
    { companyId: own.id, applicationId: ownApplication.id, createdByUserId: recruiter.record.id, title: "Own interview", status: "SCHEDULED", timezone: "UTC", scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
    { companyId: other.id, applicationId: otherApplication.id, createdByUserId: recruiter.record.id, title: "Other interview", status: "SCHEDULED", timezone: "UTC", scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000) },
  ] });
  await prisma.offer.createMany({ data: [
    { applicationId: ownApplication.id, jobId: ownJob.id, studentUserId: student.id, createdByUserId: recruiter.record.id, designation: "Own offer", compensation: {}, joiningDate: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 3 * 86400000), status: "SENT" },
    { applicationId: otherApplication.id, jobId: otherJob.id, studentUserId: student.id, createdByUserId: recruiter.record.id, designation: "Other offer", compensation: {}, joiningDate: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 3 * 86400000), status: "SENT" },
  ] });
  const summary = JSON.parse((await request(recruiter.cookie, "/recruiter/dashboard/summary")).text);
  assert.equal(summary.data.kpis.newApplicants, 1);
  assert.equal(summary.data.kpis.interviewsToday, 1);
  assert.equal(summary.data.kpis.offersAwaitingResponse, 1);
  assert.ok(summary.data.upcomingInterviews.every((item) => item.application.job.id === ownJob.id));
  const analytics = JSON.parse((await request(recruiter.cookie, "/recruiter/analytics")).text);
  assert.deepEqual(analytics.data.perJob.map((row) => row.jobId), [ownJob.id]);
  const csv = await request(recruiter.cookie, "/recruiter/analytics?format=csv");
  assert.match(csv.text, /Own role/);
  assert.doesNotMatch(csv.text, /Other role/);
});

test("analytics applies date filters and returns a real empty response", async () => {
  const recruiter = await createUser("r2-dates");
  const company = await prisma.company.create({ data: { name: "Date R2 Company" } });
  companies.push(company.id);
  await prisma.companyMember.create({ data: { companyId: company.id, userId: recruiter.record.id, role: "OWNER" } });
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: recruiter.record.id, title: "Date role", description: "A sufficiently long date role description.", employmentType: "FULL_TIME" } });
  jobs.push(job.id);
  const old = new Date(Date.now() - 90 * 86400000);
  const recentStudent = await prisma.user.create({ data: { email: `r2-date-student-${crypto.randomUUID()}@example.test`, emailNormalized: `r2-date-student-${crypto.randomUUID()}@example.test`, fullName: "Date Student", role: "STUDENT", status: "ACTIVE", emailVerifiedAt: new Date() } });
  users.push(recentStudent.id);
  const oldApp = await prisma.application.create({ data: { jobId: job.id, studentUserId: recentStudent.id, status: "APPLIED", consentSnapshot: {}, appliedAt: old } });
  applications.push(oldApp.id);
  const empty = JSON.parse((await request(recruiter.cookie, `/recruiter/analytics?from=${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`)).text);
  assert.deepEqual(empty.data.perJob, []);
});

test("analytics CSV export logs actor, range, and row count", async () => {
  const recruiter = await createUser("r2-export");
  const before = await prisma.auditLog.count({ where: { actorUserId: recruiter.record.id, action: "RECRUITER_ANALYTICS_CSV_EXPORT" } });
  const result = await request(recruiter.cookie, "/recruiter/analytics?format=csv");
  assert.equal(result.response.status, 200);
  assert.match(result.text, /"Job","Applicants","Shortlisted","Hired"/);
  const audit = await prisma.auditLog.findFirst({ where: { actorUserId: recruiter.record.id, action: "RECRUITER_ANALYTICS_CSV_EXPORT" }, orderBy: { createdAt: "desc" } });
  assert.equal(before + 1, await prisma.auditLog.count({ where: { actorUserId: recruiter.record.id, action: "RECRUITER_ANALYTICS_CSV_EXPORT" } }));
  assert.equal(audit.actorUserId, recruiter.record.id);
  assert.ok(audit.createdAt instanceof Date);
  assert.equal(audit.after.rowCount, 0);
});

test("cache entries include company scope and both endpoints fall back when Redis is down", async () => {
  const first = await createUser("r2-cache-a");
  const second = await createUser("r2-cache-b");
  const firstCompany = await prisma.company.create({ data: { name: "Cache A" } });
  const secondCompany = await prisma.company.create({ data: { name: "Cache B" } });
  companies.push(firstCompany.id, secondCompany.id);
  await prisma.companyMember.createMany({ data: [{ companyId: firstCompany.id, userId: first.record.id, role: "OWNER" }, { companyId: secondCompany.id, userId: second.record.id, role: "OWNER" }] });
  const aSummary = await request(first.cookie, "/recruiter/dashboard/summary");
  const bSummary = await request(second.cookie, "/recruiter/dashboard/summary");
  const aAnalytics = await request(first.cookie, "/recruiter/analytics");
  const bAnalytics = await request(second.cookie, "/recruiter/analytics");
  assert.equal(aSummary.response.status, 200);
  assert.equal(bSummary.response.status, 200);
  assert.equal(aAnalytics.response.status, 200);
  assert.equal(bAnalytics.response.status, 200);
  const Redis = require("ioredis");
  const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6380");
  const keys = await redis.keys("recruiter:*");
  await redis.quit();
  assert.ok(keys.some((key) => key.includes(firstCompany.id)));
  assert.ok(keys.some((key) => key.includes(secondCompany.id)));
  const previousUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  await resetAnalyticsRedis();
  assert.equal((await request(first.cookie, "/recruiter/dashboard/summary")).response.status, 200);
  assert.equal((await request(first.cookie, "/recruiter/analytics")).response.status, 200);
  process.env.REDIS_URL = previousUrl;
  await resetAnalyticsRedis();
});

test("CSV export escapes spreadsheet formula cells", async () => {
  const recruiter = await createUser("r2-csv-safe");
  const company = await prisma.company.create({ data: { name: "CSV Safe" } });
  companies.push(company.id);
  await prisma.companyMember.create({ data: { companyId: company.id, userId: recruiter.record.id, role: "OWNER" } });
  const job = await prisma.job.create({ data: { companyId: company.id, createdByUserId: recruiter.record.id, title: "=SUM(A1:A2)", description: "A sufficiently long CSV safety description.", employmentType: "FULL_TIME" } });
  jobs.push(job.id);
  const student = await prisma.user.create({ data: { email: `r2-csv-student-${crypto.randomUUID()}@example.test`, emailNormalized: `r2-csv-student-${crypto.randomUUID()}@example.test`, fullName: "CSV Student", role: "STUDENT", status: "ACTIVE", emailVerifiedAt: new Date() } });
  users.push(student.id);
  const application = await prisma.application.create({ data: { jobId: job.id, studentUserId: student.id, status: "APPLIED", consentSnapshot: {}, appliedAt: new Date() } });
  applications.push(application.id);
  const result = await request(recruiter.cookie, "/recruiter/analytics?format=csv");
  assert.equal(result.response.status, 200);
  assert.match(result.text, /"'=SUM\(A1:A2\)"/);
});

test("analytics date validation returns field-level errors", async () => {
  const recruiter = await createUser("r2-date-errors");
  for (const query of [
    "from=not-a-date&to=2026-11-18T00:00:00.000Z",
    "from=2026-11-19T00:00:00.000Z&to=2026-11-18T00:00:00.000Z",
    "from=2024-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z",
  ]) {
    const result = await request(recruiter.cookie, `/recruiter/analytics?${query}`);
    const body = JSON.parse(result.text);
    assert.equal(result.response.status, 400);
    assert.ok(body.error.details?.length);
    assert.ok(body.error.details.every((detail) => detail.path));
  }
});
