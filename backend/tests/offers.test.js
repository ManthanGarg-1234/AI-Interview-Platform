"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const app = require("../index");
const { getPrisma } = require("../prisma");
const { hashPassword } = require("../services/password");
const { closeAuthRateLimitRedis } = require("../middleware/auth-rate-limit");
const { expireOffers, startOfferExpiryFallback, stopOfferExpiryFallback } = require("../offer-expiry");

const prisma = getPrisma();
const password = "Valid-Passphrase-2030!";
const frontendOrigin = new URL(process.env.FRONTEND_ORIGIN || "http://localhost:5173").origin;
let server;
let origin;
const userIds = [];
let student;
let otherStudent;
let recruiter;
let company;
let job;
let reapplicationNumber = 1;

function cookiePairs(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; ");
}

function csrfToken(cookie) {
  const match = cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function createUser(role, prefix) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      fullName: `${prefix} Test`,
      passwordHash: await hashPassword(password),
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  const login = await fetch(`${origin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: frontendOrigin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  return { user, cookie: cookiePairs(login) };
}

async function request(cookie, path, { method = "GET", body } = {}) {
  const headers = { origin: frontendOrigin };
  if (cookie) headers.cookie = cookie;
  if (cookie && !["GET", "HEAD", "OPTIONS"].includes(method)) headers["x-csrf-token"] = csrfToken(cookie);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, json: await response.json().catch(() => null) };
}

async function createOffer({ studentUserId = student.user.id, status = "SENT", expiresAt = new Date(Date.now() + 86_400_000), applicationStatus = "OFFER_RELEASED" } = {}) {
  const application = await prisma.application.create({
    data: {
      jobId: job.id,
      studentUserId,
      reapplicationNumber: reapplicationNumber++,
      status: applicationStatus,
      consentSnapshot: { termsAccepted: true },
    },
  });
  const offer = await prisma.offer.create({
    data: {
      applicationId: application.id,
      jobId: job.id,
      studentUserId,
      createdByUserId: recruiter.user.id,
      designation: "Software Engineer",
      compensation: { currency: "INR", baseSalary: 1200000, variable: 100000, bonus: 50000 },
      joiningDate: new Date(Date.now() + 30 * 86_400_000),
      expiresAt,
      status,
      ...(status !== "SENT" ? { respondedAt: new Date() } : {}),
    },
  });
  return { application, offer };
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  student = await createUser("STUDENT", "offer-student");
  otherStudent = await createUser("STUDENT", "offer-other-student");
  recruiter = await createUser("RECRUITER", "offer-recruiter");
  company = await prisma.company.create({ data: { name: `Offer Test Company ${crypto.randomUUID()}`, status: "VERIFIED", verifiedAt: new Date() } });
  await prisma.companyMember.create({
    data: { companyId: company.id, userId: recruiter.user.id, role: "HIRING_MANAGER", active: true },
  });
  job = await prisma.job.create({
    data: {
      companyId: company.id,
      createdByUserId: recruiter.user.id,
      title: "Backend Engineer",
      description: "Backend engineering role",
      employmentType: "FULL_TIME",
      status: "PUBLISHED",
    },
  });
});

test.after(async () => {
  stopOfferExpiryFallback();
  await prisma.offer.deleteMany({ where: { studentUserId: { in: userIds } } });
  await prisma.application.deleteMany({ where: { studentUserId: { in: userIds } } });
  await prisma.job.deleteMany({ where: { id: job?.id } });
  await prisma.companyMember.deleteMany({ where: { companyId: company?.id } });
  await prisma.company.deleteMany({ where: { id: company?.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { resourceId: { in: userIds } }] } });
  await prisma.securityEvent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test.afterEach(async () => {
  const studentIds = [student?.user?.id, otherStudent?.user?.id].filter(Boolean);
  await prisma.applicationStageHistory.deleteMany({ where: { changedByUserId: { in: studentIds } } });
  await prisma.offer.deleteMany({ where: { studentUserId: { in: studentIds } } });
  await prisma.application.deleteMany({ where: { studentUserId: { in: studentIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: studentIds } }, { userId: recruiter?.user?.id }] } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: studentIds } }, { resourceId: { in: studentIds } }] } });
});

test("PENDING offer transitions to ACCEPTED or REJECTED and invalid transitions are refused", async () => {
  const accepted = await createOffer();
  let result = await request(student.cookie, `/me/offers/${accepted.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(result.response.status, 200);
  assert.equal(result.json.data.status, "ACCEPTED");

  result = await request(student.cookie, `/me/offers/${accepted.offer.id}/respond`, { method: "POST", body: { status: "REJECTED" } });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error.code, "INVALID_OFFER_STATE");

  const rejected = await createOffer();
  result = await request(student.cookie, `/me/offers/${rejected.offer.id}/respond`, { method: "POST", body: { status: "REJECTED", reason: "Compensation mismatch" } });
  assert.equal(result.response.status, 200);
  assert.equal(result.json.data.status, "REJECTED");

  result = await request(student.cookie, `/me/offers/${rejected.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(result.response.status, 409);

  const expired = await createOffer({ status: "EXPIRED", expiresAt: new Date(Date.now() - 1000) });
  result = await request(student.cookie, `/me/offers/${expired.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error.code, "INVALID_OFFER_STATE");
});

test("accept twice is idempotent and creates one audit entry, notification, and application stage change", async () => {
  const fixture = await createOffer();
  const first = await request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  const second = await request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.json.data.status, "ACCEPTED");
  assert.equal(second.json.data.status, "ACCEPTED");

  assert.equal(await prisma.auditLog.count({ where: { action: "OFFER_ACCEPTED", resourceType: "OFFER", resourceId: fixture.offer.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { userId: recruiter.user.id, resourceType: "OFFER", resourceId: fixture.offer.id } }), 1);
  assert.equal(await prisma.applicationStageHistory.count({ where: { applicationId: fixture.application.id, toStatus: "HIRED" } }), 1);
  assert.equal((await prisma.application.findUnique({ where: { id: fixture.application.id } })).status, "HIRED");

  const pendingAfterAccept = await createOffer();
  assert.equal((await prisma.offer.findUnique({ where: { id: pendingAfterAccept.offer.id } })).status, "SENT");
});

test("two concurrent accept requests produce exactly one transition", async () => {
  const fixture = await createOffer();
  const [one, two] = await Promise.all([
    request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } }),
    request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } }),
  ]);
  assert.deepEqual([one.response.status, two.response.status].sort(), [200, 200]);
  assert.equal(await prisma.auditLog.count({ where: { action: "OFFER_ACCEPTED", resourceType: "OFFER", resourceId: fixture.offer.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { resourceType: "OFFER", resourceId: fixture.offer.id } }), 1);
});

test("accepting a second offer sequentially is refused after a student accepted one", async () => {
  const first = await createOffer();
  const second = await createOffer();
  const accepted = await request(student.cookie, `/me/offers/${first.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(accepted.response.status, 200);
  const refused = await request(student.cookie, `/me/offers/${second.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(refused.response.status, 409);
  assert.equal(refused.json.error.code, "OFFER_ALREADY_ACCEPTED");
  assert.equal(refused.json.error.message, "You have already accepted an offer");
  assert.equal((await prisma.offer.findUnique({ where: { id: second.offer.id } })).status, "SENT");
});

test("concurrent accepts of different offers allow exactly one acceptance", async () => {
  const first = await createOffer();
  const second = await createOffer();
  const results = await Promise.all([
    request(student.cookie, `/me/offers/${first.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } }),
    request(student.cookie, `/me/offers/${second.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } }),
  ]);
  assert.equal(results.filter(({ response }) => response.status === 200).length, 1);
  const refused = results.find(({ response }) => response.status === 409);
  assert.equal(refused.json.error.code, "OFFER_ALREADY_ACCEPTED");
  const statuses = await Promise.all([first.offer.id, second.offer.id].map((id) => prisma.offer.findUnique({ where: { id } }).then((offer) => offer.status)));
  assert.deepEqual(statuses.sort(), ["ACCEPTED", "SENT"]);
});

test("expired offer is refused and is shown as EXPIRED", async () => {
  const fixture = await createOffer({ expiresAt: new Date(Date.now() - 60_000) });
  const result = await request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.error.code, "OFFER_EXPIRED");
  assert.equal((await prisma.offer.findUnique({ where: { id: fixture.offer.id } })).status, "EXPIRED");
});

test("student detail and responses are strictly authorized", async () => {
  const fixture = await createOffer();
  const detail = await request(otherStudent.cookie, `/me/offers/${fixture.offer.id}`);
  assert.equal(detail.response.status, 404);
  const accept = await request(otherStudent.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "ACCEPTED" } });
  assert.equal(accept.response.status, 404);
  const reject = await request(otherStudent.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "REJECTED" } });
  assert.equal(reject.response.status, 404);
  const recruiterDetail = await request(recruiter.cookie, `/me/offers/${fixture.offer.id}`);
  assert.equal(recruiterDetail.response.status, 403);
});

test("reject stores an optional reason and rejects reasons over 1000 characters", async () => {
  const fixture = await createOffer();
  const withReason = await request(student.cookie, `/me/offers/${fixture.offer.id}/respond`, { method: "POST", body: { status: "REJECTED", reason: "Accepted another role" } });
  assert.equal(withReason.response.status, 200);
  assert.equal((await prisma.offer.findUnique({ where: { id: fixture.offer.id } })).responseReason, "Accepted another role");

  const noReason = await createOffer();
  const omitted = await request(student.cookie, `/me/offers/${noReason.offer.id}/respond`, { method: "POST", body: { status: "REJECTED" } });
  assert.equal(omitted.response.status, 200);
  assert.equal((await prisma.offer.findUnique({ where: { id: noReason.offer.id } })).responseReason, null);

  const tooLong = await createOffer();
  const longResult = await request(student.cookie, `/me/offers/${tooLong.offer.id}/respond`, { method: "POST", body: { status: "REJECTED", reason: "x".repeat(1001) } });
  assert.equal(longResult.response.status, 400);
});

test("expiry job expires past-due pending offers once and leaves resolved offers untouched", async () => {
  const pastDue = await createOffer({ expiresAt: new Date(Date.now() - 60_000) });
  const accepted = await createOffer({ status: "ACCEPTED", expiresAt: new Date(Date.now() - 60_000) });
  const rejected = await createOffer({ status: "REJECTED", expiresAt: new Date(Date.now() - 60_000) });

  assert.equal(await expireOffers(), 1);
  assert.equal((await prisma.offer.findUnique({ where: { id: pastDue.offer.id } })).status, "EXPIRED");
  assert.equal((await prisma.offer.findUnique({ where: { id: accepted.offer.id } })).status, "ACCEPTED");
  assert.equal((await prisma.offer.findUnique({ where: { id: rejected.offer.id } })).status, "REJECTED");

  assert.equal(await prisma.notification.count({ where: { resourceType: "OFFER", resourceId: pastDue.offer.id } }), 2);
  assert.equal(await expireOffers(), 0);
  assert.equal(await prisma.notification.count({ where: { resourceType: "OFFER", resourceId: pastDue.offer.id } }), 2);
});

test("synchronous expiry fallback processes past-due offers", async () => {
  const fixture = await createOffer({ expiresAt: new Date(Date.now() - 60_000) });
  startOfferExpiryFallback(10);
  await new Promise((resolve) => setTimeout(resolve, 150));
  stopOfferExpiryFallback();
  assert.equal((await prisma.offer.findUnique({ where: { id: fixture.offer.id } })).status, "EXPIRED");
});
