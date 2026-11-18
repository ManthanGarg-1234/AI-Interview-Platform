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
const userIds = [];
const companyIds = [];
const jobIds = [];
const applicationIds = [];
const interviewIds = [];
const offerIds = [];

function cookies(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; ");
}
function csrf(cookie) {
  return decodeURIComponent(cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/)?.[1] || "");
}
async function user(role, label) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const record = await prisma.user.create({ data: { email, emailNormalized: email, fullName: label, passwordHash: await hashPassword(password), role, status: "ACTIVE", emailVerifiedAt: new Date() } });
  userIds.push(record.id);
  const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: frontendOrigin }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  return { record, cookie: cookies(login) };
}
async function request(cookie, path, { method = "GET", body } = {}) {
  const headers = { origin: frontendOrigin, cookie };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["x-csrf-token"] = csrf(cookie);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, json: await response.json().catch(() => null) };
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await prisma.recruiterInterview.deleteMany({ where: { id: { in: interviewIds } } });
  await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
  await prisma.applicationStageHistory.deleteMany({ where: { applicationId: { in: applicationIds } } });
  await prisma.application.deleteMany({ where: { id: { in: applicationIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.companyVerification.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.companyMember.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await resetAnalyticsRedis();
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test("recruiter, admin, student, interview, and offer journey stays consistent", async () => {
  const recruiter = await user("RECRUITER", "journey-recruiter");
  const admin = await user("ADMIN", "journey-admin");
  const student = await user("STUDENT", "journey-student");
  await prisma.studentProfile.create({ data: { userId: student.record.id, firstName: "Journey", lastName: "Student" } });

  const createdCompany = await request(recruiter.cookie, "/recruiter/companies", { method: "POST", body: { name: "Journey Company" } });
  assert.equal(createdCompany.response.status, 201);
  const companyId = createdCompany.json.data.id;
  companyIds.push(companyId);
  await prisma.companyMember.update({ where: { companyId_userId: { companyId, userId: recruiter.record.id } }, data: { role: "OWNER" } });

  const submitted = await request(recruiter.cookie, `/recruiter/companies/${companyId}/verification`, { method: "POST", body: { note: "Business registration submitted." } });
  assert.equal(submitted.response.status, 201);
  const verified = await request(admin.cookie, `/admin/companies/verifications/${submitted.json.data.id}`, { method: "PATCH", body: { status: "VERIFIED", note: "Verified." } });
  assert.equal(verified.response.status, 200);

  const createdJob = await request(recruiter.cookie, "/recruiter/jobs", { method: "POST", body: { companyId, title: "Journey Engineer", description: "A cross-portal journey role.", employmentType: "FULL_TIME" } });
  assert.equal(createdJob.response.status, 201);
  const jobId = createdJob.json.data.id;
  jobIds.push(jobId);
  assert.equal((await request(recruiter.cookie, `/recruiter/jobs/${jobId}/publish`, { method: "POST" })).response.status, 200);
  const search = await request(student.cookie, "/jobs");
  assert.equal(search.json.data.items.some((job) => job.id === jobId), true);
  assert.equal((await request(recruiter.cookie, "/recruiter/dashboard/summary")).json.data.kpis.newApplicants, 0);

  const applied = await request(student.cookie, `/jobs/${jobId}/apply`, { method: "POST", body: { consent: true } });
  assert.equal(applied.response.status, 201);
  const applicationId = applied.json.data.id;
  applicationIds.push(applicationId);
  const cachedSummary = await request(recruiter.cookie, "/recruiter/dashboard/summary");
  assert.equal(cachedSummary.json.data.kpis.newApplicants, 1);
  assert.equal((await request(recruiter.cookie, "/recruiter/applications")).json.data.length, 1);

  for (const status of ["SCREENING", "SHORTLISTED"]) {
    assert.equal((await request(recruiter.cookie, `/recruiter/applications/${applicationId}/status`, { method: "PATCH", body: { status } })).response.status, 200);
  }
  assert.equal((await request(recruiter.cookie, "/recruiter/dashboard/summary")).json.data.pipeline.find((item) => item.stage === "SHORTLISTED")?.count, 1);
  const start = new Date(Date.now() + 3_600_000);
  const interview = await request(recruiter.cookie, "/recruiter/interviews", { method: "POST", body: { applicationId, title: "Journey interview", timezone: "UTC", startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), rounds: [{ name: "Technical" }], interviewerIds: [] } });
  assert.equal(interview.response.status, 201);
  interviewIds.push(interview.json.data.id);
  assert.equal((await request(student.cookie, "/interviews")).json.data.length, 1);
  const studentReschedule = await request(student.cookie, `/interviews/${interview.json.data.id}/request-reschedule`, { method: "POST", body: { startsAt: new Date(start.getTime() + 7200000), endsAt: new Date(start.getTime() + 10800000), timezone: "UTC", reason: "Candidate requested a later time." } });
  assert.equal(studentReschedule.response.status, 201);
  const rescheduleRequestId = studentReschedule.json.data.id;
  const approvedReschedule = await request(recruiter.cookie, `/recruiter/interviews/${interview.json.data.id}/reschedule-requests/${rescheduleRequestId}/decision`, { method: "POST", body: { status: "APPROVED" } });
  assert.equal(approvedReschedule.response.status, 200);
  assert.equal((await request(student.cookie, `/interviews/${interview.json.data.id}`)).json.data.scheduledStart, new Date(start.getTime() + 7200000).toISOString());
  const offer = await request(recruiter.cookie, "/recruiter/offers", { method: "POST", body: { applicationId, designation: "Journey Engineer", compensation: { currency: "INR", baseSalary: 1000000 }, joiningDate: new Date(Date.now() + 2 * 86400000), expiresAt: new Date(Date.now() + 3 * 86400000) } });
  assert.equal(offer.response.status, 201);
  offerIds.push(offer.json.data.id);
  assert.equal((await request(recruiter.cookie, `/recruiter/offers/${offer.json.data.id}/send`, { method: "POST" })).response.status, 200);
  assert.equal((await request(recruiter.cookie, "/recruiter/analytics")).json.data.metrics.offerAcceptanceRate, 0);
  assert.equal((await request(student.cookie, "/me/offers")).json.data.length, 1);
  assert.equal((await request(student.cookie, `/me/offers/${offer.json.data.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } })).response.status, 200);
  assert.equal((await request(recruiter.cookie, "/recruiter/analytics")).json.data.metrics.offerAcceptanceRate, 100);
  assert.equal((await request(recruiter.cookie, `/recruiter/applications/${applicationId}`)).json.data.status, "HIRED");

  const dashboard = (await request(recruiter.cookie, "/recruiter/dashboard/summary")).json.data;
  const analytics = (await request(recruiter.cookie, "/recruiter/analytics")).json.data;
  assert.equal(dashboard.pipeline.find((item) => item.stage === "HIRED")?.count, 1);
  assert.equal(analytics.perJob.find((item) => item.jobId === jobId)?.applicants, 1);
  assert.equal((await request(recruiter.cookie, "/recruiter/applications")).json.data.length, 1);

  assert.equal((await request(recruiter.cookie, `/recruiter/jobs/${jobId}/close`, { method: "POST" })).response.status, 200);
  assert.equal((await request(recruiter.cookie, `/recruiter/jobs/${jobId}/archive`, { method: "POST" })).response.status, 200);
  assert.equal((await request(student.cookie, "/jobs")).json.data.items.some((job) => job.id === jobId), false);
  assert.equal((await request(student.cookie, "/jobs/me/applications")).json.data.some((application) => application.id === applicationId), true);
});
