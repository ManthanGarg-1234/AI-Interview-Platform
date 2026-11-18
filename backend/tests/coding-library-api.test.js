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
let student;
let secondStudent;
let admin;
let studentCookie;
let secondStudentCookie;
let adminCookie;
let testProblem;
let testSheet;
const userIds = [];

function cookiePairs(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(";", 1)[0]).join("; ");
}

function csrfToken(cookie) {
  const found = cookie.match(/(?:^|;\s*)career_csrf=([^;]+)/);
  return found ? decodeURIComponent(found[1]) : "";
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
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: frontendOrigin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return { user, cookie: cookiePairs(response) };
}

async function request(path, { cookie = "", method = "GET", body } = {}) {
  const headers = { origin: frontendOrigin };
  if (cookie) headers.cookie = cookie;
  if (cookie && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["x-csrf-token"] = csrfToken(cookie);
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, json: await response.json().catch(() => null) };
}

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  testProblem = await prisma.problem.findFirst({
    where: {
      status: "PUBLISHED",
      canonicalProblemId: null,
      sheetAssociations: { some: { sheet: { status: "PUBLISHED" } } },
      codingTopics: { some: {} },
    },
    include: {
      sheetAssociations: { where: { sheet: { status: "PUBLISHED" } }, include: { sheet: true }, take: 1 },
      codingTopics: { include: { topic: true }, take: 1 },
    },
  });
  assert.ok(testProblem, "the seeded placement catalogue must provide a published problem");
  testSheet = testProblem.sheetAssociations[0].sheet;
  student = await createUser("STUDENT", "library-student");
  secondStudent = await createUser("STUDENT", "library-other-student");
  admin = await createUser("ADMIN", "library-admin");
  studentCookie = student.cookie;
  secondStudentCookie = secondStudent.cookie;
  adminCookie = admin.cookie;
});

test.after(async () => {
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (server) await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  await closeAuthRateLimitRedis();
  await prisma.$disconnect();
});

test("library filters are composed server-side and admin APIs enforce admin role", async () => {
  const topic = testProblem.codingTopics[0].topic;
  const params = new URLSearchParams({
    sheet: testSheet.slug,
    topic: topic.slug,
    platform: testProblem.platform,
    difficulty: testProblem.difficulty,
    source: testSheet.source,
  });
  if (testProblem.placementPriority) params.set("priority", String(testProblem.placementPriority));
  const { response, json } = await request(`/coding/library/problems?${params}`, { cookie: studentCookie });
  assert.equal(response.status, 200);
  assert.ok(json.data.items.some((problem) => problem.id === testProblem.id));

  const sheetList = await request(`/coding/library/sheets?status=NOT_STARTED&difficulty=${testProblem.difficulty}&platform=${testProblem.platform}`, { cookie: studentCookie });
  assert.equal(sheetList.response.status, 200);
  assert.ok(sheetList.json.data.items.some((sheet) => sheet.id === testSheet.id));

  const forbidden = await request("/admin/coding-library/stats", { cookie: studentCookie });
  assert.equal(forbidden.response.status, 403);
  const stats = await request("/admin/coding-library/stats", { cookie: adminCookie });
  assert.equal(stats.response.status, 200);
  assert.ok(stats.json.data.uniqueProblems >= 1);

  const csv = [
    "sheetSlug,title,difficulty,platform,url,topic",
    [testSheet.slug, testProblem.title, testProblem.difficulty, testProblem.platform, testProblem.url, topic.name]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  ].join("\n");
  const studentPreview = await request("/admin/coding-library/import/preview", {
    cookie: studentCookie,
    method: "POST",
    body: { csv },
  });
  assert.equal(studentPreview.response.status, 403);
  const preview = await request("/admin/coding-library/import/preview", {
    cookie: adminCookie,
    method: "POST",
    body: { csv },
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.json.data.rows, 1);
  assert.equal(preview.json.data.validRows, 1);
  assert.equal(preview.json.data.alreadyAssociated.length, 1);
});

test("student progress, bookmarks, and notes are private to each user", async () => {
  const problemPath = `/coding/library/problems/${testProblem.id}`;
  const savedNote = await request(`${problemPath}/note`, { cookie: studentCookie, method: "PUT", body: { note: "Review the invariant before the next practice." } });
  assert.equal(savedNote.response.status, 200);

  const savedBookmark = await request(`${problemPath}/bookmark`, { cookie: studentCookie, method: "POST" });
  assert.equal(savedBookmark.response.status, 201, JSON.stringify(savedBookmark.json));
  const solved = await request(`${problemPath}/progress`, { cookie: studentCookie, method: "PUT", body: { status: "SOLVED" } });
  assert.equal(solved.response.status, 200);
  assert.equal(solved.json.data.status, "SOLVED");

  const mine = await request(problemPath, { cookie: studentCookie });
  assert.equal(mine.response.status, 200);
  assert.equal(mine.json.data.note, "Review the invariant before the next practice.");
  assert.equal(mine.json.data.bookmarked, true);
  assert.equal(mine.json.data.progress.status, "SOLVED");

  const other = await request(problemPath, { cookie: secondStudentCookie });
  assert.equal(other.response.status, 200);
  assert.equal(other.json.data.note, "");
  assert.equal(other.json.data.bookmarked, false);
  assert.equal(other.json.data.progress.status, "NOT_STARTED");

  const otherBookmarks = await request("/coding/library/bookmarks", { cookie: secondStudentCookie });
  assert.equal(otherBookmarks.response.status, 200);
  assert.equal(otherBookmarks.json.data.total, 0);
  const solvedFilter = await request("/coding/library/problems?progress=SOLVED", { cookie: studentCookie });
  assert.ok(solvedFilter.json.data.items.some((problem) => problem.id === testProblem.id));
});
