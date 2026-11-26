"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../index");
const { validateEnv } = require("../config/env");
const { getPrisma } = require("../prisma");
const { closeAuthRateLimitRedis } = require("../middleware/auth-rate-limit");
const { hashPassword } = require("../services/password");
const googleOAuth = require("../google-oauth");
const firebaseAuth = require("../firebase-auth");

const frontendOrigin = new URL(
  process.env.FRONTEND_ORIGIN || "http://localhost:5173",
).origin;
const testPassword = "Valid-Passphrase-2030!";
let server;
let origin;
let emailServer;
const deliveredEmails = [];
const createdEmails = new Set();
const requestIds = new Set();

test.before(async () => {
  emailServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    deliveredEmails.push({
      authorized: req.headers.authorization === "Bearer test-email-key",
      ...JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.writeHead(req.url === "/fail" ? 503 : 202).end();
  });
  await new Promise((resolve) => emailServer.listen(0, "127.0.0.1", resolve));
  process.env.EMAIL_API_URL = `http://127.0.0.1:${emailServer.address().port}/send`;
  process.env.EMAIL_API_KEY = "test-email-key";
  process.env.EMAIL_PROVIDER = "test";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  if (emailServer) {
    await new Promise((resolve) => {
      emailServer.close(resolve);
      emailServer.closeAllConnections();
    });
  }
  await closeAuthRateLimitRedis();
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { emailNormalized: { in: [...createdEmails] } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  const auditFilters = [];
  if (requestIds.size)
    auditFilters.push({ requestId: { in: [...requestIds] } });
  if (userIds.length) {
    auditFilters.push({ actorUserId: { in: userIds } });
    auditFilters.push({ resourceId: { in: userIds } });
    await prisma.securityEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.consentRecord.deleteMany({
      where: { userId: { in: userIds } },
    });
  }
  if (auditFilters.length)
    await prisma.auditLog.deleteMany({ where: { OR: auditFilters } });
  if (userIds.length)
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

function trackEmail(email) {
  createdEmails.add(email.trim().toLowerCase());
  return email;
}

function emailTokenFor(email, subjectPrefix) {
  const message = [...deliveredEmails]
    .reverse()
    .find(
      (item) => item.to === email && item.subject.startsWith(subjectPrefix),
    );
  assert.ok(
    message,
    `expected an email with subject starting ${subjectPrefix}; received ${JSON.stringify(deliveredEmails.map(({ to, subject }) => ({ to, subject })))}`,
  );
  assert.equal(message.authorized, true);
  const match = message.text.match(/https?:\/\/\S+/);
  assert.ok(match, "expected an action link in the email body");
  const link = new URL(match[0]);
  assert.equal(link.search, "");
  const token = new URLSearchParams(link.hash.slice(1)).get("token");
  assert.ok(token);
  return token;
}

function cookiePairs(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

function readCookie(cookieHeader, name) {
  const found = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return found?.[1];
}

async function request(
  path,
  {
    method = "GET",
    body,
    cookie,
    csrf,
    headers = {},
    originHeader = frontendOrigin,
    redirect = "follow",
  } = {},
) {
  const requestHeaders = { ...headers };
  if (originHeader) requestHeaders.origin = originHeader;
  if (cookie) requestHeaders.cookie = cookie;
  if (csrf) requestHeaders["x-csrf-token"] = csrf;
  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
  }
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });
  const requestId = response.headers.get("x-request-id");
  if (requestId) requestIds.add(requestId);
  return response;
}

function configureGoogleOAuth() {
  const keys = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_CALLBACK_URL",
  ];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const backendOrigin = new URL(validateEnv().BACKEND_ORIGIN).origin;
  process.env.GOOGLE_OAUTH_CLIENT_ID =
    "test-google-client.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-client-secret";
  process.env.GOOGLE_OAUTH_CALLBACK_URL = `${backendOrigin}/api/v1/auth/google/callback`;
  return () =>
    keys.forEach((key) => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
}

function fakeGoogleClient(claims) {
  let authorization;
  let exchanged;
  return {
    getAuthorization() {
      return authorization;
    },
    getExchange() {
      return exchanged;
    },
    generateAuthUrl(options) {
      authorization = options;
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        state: options.state,
        nonce: options.nonce,
        code_challenge: options.code_challenge,
        code_challenge_method: options.code_challenge_method,
      }).toString();
      return url.toString();
    },
    async getToken(options) {
      exchanged = options;
      return { tokens: { id_token: "mock-google-id-token" } };
    },
    async verifyIdToken(options) {
      assert.equal(options.idToken, "mock-google-id-token");
      assert.equal(options.audience, process.env.GOOGLE_OAUTH_CLIENT_ID);
      return { getPayload: () => ({ ...claims, nonce: authorization.nonce }) };
    },
  };
}

async function beginGoogleOAuth(
  client,
  { acceptedTerms = false, acceptedPrivacyPolicy = false } = {},
) {
  const start = await request("/auth/google/start", {
    method: "POST",
    body: { acceptedTerms, acceptedPrivacyPolicy },
  });
  assert.equal(start.status, 200);
  const cookies = cookiePairs(start);
  const authorizationUrl = new URL((await start.json()).data.authorizationUrl);
  const options = client.getAuthorization();
  assert.equal(authorizationUrl.searchParams.get("state"), options.state);
  assert.equal(authorizationUrl.searchParams.get("nonce"), options.nonce);
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge_method"),
    "S256",
  );
  assert.equal(
    authorizationUrl.searchParams.get("code_challenge"),
    options.code_challenge,
  );
  assert.equal(cookies.includes(options.state), false);
  return {
    cookies,
    state: options.state,
    codeChallenge: options.code_challenge,
  };
}

async function seedUser({
  role = "STUDENT",
  status = "ACTIVE",
  password = testPassword,
  legacyBcrypt = false,
  email = `auth-${crypto.randomUUID()}@example.test`,
} = {}) {
  const passwordHash =
    password === null
      ? null
      : legacyBcrypt
        ? await bcrypt.hash(password, 10)
        : await hashPassword(password);
  trackEmail(email);
  return getPrisma().user.create({
    data: {
      email,
      emailNormalized: email.trim().toLowerCase(),
      fullName: "Test Authentication User",
      passwordHash,
      role,
      status,
      emailVerifiedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
}

test("student dashboard reports caller-owned profile and recorded activity data", async () => {
  const user = await seedUser();
  const prisma = getPrisma();
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      firstName: "Dashboard",
      lastName: "Student",
      headline: "Backend developer",
    },
  });
  await prisma.studentActivity.create({
    data: {
      studentProfileId: profile.id,
      activityType: "PRACTICE_COMPLETED",
      occurredAt: new Date(),
    },
  });
  const { cookie } = await loginUser(user);
  const response = await request("/me/dashboard", authenticatedOptions(cookie));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.profile.name, "Dashboard Student");
  assert.equal(result.data.profile.completionPercent, 10);
  assert.equal(result.data.student.name, "Dashboard Student");
  assert.equal(result.data.student.profileCompletion, 10);
  assert.equal(result.data.overview.applicationsTotal, 0);
  assert.equal(result.data.overview.codingSolved, 0);
  assert.deepEqual(result.data.upcoming.interviews, []);
  assert.equal(result.data.recentActivity[0].type, "PRACTICE_COMPLETED");
  assert.equal(
    result.data.weeklyActivity.reduce((sum, day) => sum + day.count, 0),
    1,
  );
  assert.ok(
    result.data.recommendations.some(
      (item) => item.href === "/student/profile",
    ),
  );
});

test("placement sheets use external URLs and persist manual progress", async () => {
  const user = await seedUser();
  const profile = await getPrisma().studentProfile.create({
    data: { userId: user.id, firstName: "Coding", lastName: "Student" },
  });
  const { cookie } = await loginUser(user);
  const listing = await request("/coding/sheets", { cookie });
  const listingBody = await listing.json();
  assert.equal(listing.status, 200);
  const problem = listingBody.data.items.flatMap((sheet) =>
    sheet.topics.flatMap((topic) => topic.problems),
  )[0];
  assert.ok(problem);
  assert.match(problem.url, /^https:\/\//);
  assert.equal(problem.status, "NOT_STARTED");

  const updated = await request(
    `/coding/sheets/problems/${problem.id}/progress`,
    {
      ...authenticatedOptions(cookie, "PUT"),
      body: { status: "COMPLETED" },
    },
  );
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  assert.equal(updatedBody.data.status, "COMPLETED");
  const refreshed = await request("/coding/sheets", { cookie });
  const refreshedBody = await refreshed.json();
  const saved = refreshedBody.data.items
    .flatMap((sheet) => sheet.topics.flatMap((topic) => topic.problems))
    .find((item) => item.id === problem.id);
  assert.equal(saved.status, "COMPLETED");
  assert.equal(refreshedBody.data.stats.completed, 1);
  assert.equal(await getPrisma().studentActivity.count({
      where: {
        studentProfileId: profile.id,
        activityType: "CODING_SHEET_PROGRESS",
      },
    }), 1);
  const performance = await request("/me/performance?range=7", { cookie });
  const performanceBody = await performance.json();
  assert.equal(performance.status, 200);
  assert.equal(performanceBody.data.activityRangeDays, 7);
  assert.equal(performanceBody.data.coding.solved, 1);
});

test("notification pagination is scoped to the current user", async () => {
  const user = await seedUser();
  await getPrisma().notification.createMany({
    data: [
      {
        userId: user.id,
        type: "SYSTEM",
        title: "First update",
        body: "First notification.",
      },
      {
        userId: user.id,
        type: "SYSTEM",
        title: "Second update",
        body: "Second notification.",
      },
    ],
  });
  const { cookie } = await loginUser(user);
  const response = await request("/me/notifications?page=2&limit=1", {
    cookie,
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.total, 2);
  assert.equal(result.data.pages, 2);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.unread, 2);
});

test("study plans support owned task creation, status changes, and deletion", async () => {
  const user = await seedUser();
  const profile = await getPrisma().studentProfile.create({
    data: { userId: user.id, firstName: "Planner", lastName: "Student" },
  });
  const { cookie } = await loginUser(user);
  const planResponse = await request("/me/plans", {
    ...authenticatedOptions(cookie, "POST"),
    body: {
      targetRole: "Software Engineer",
      dailyMinutes: 45,
      goals: ["Practice algorithms"],
    },
  });
  assert.equal(planResponse.status, 201);
  const plan = (await planResponse.json()).data;
  const taskResponse = await request(`/me/plans/${plan.id}/tasks`, {
    ...authenticatedOptions(cookie, "POST"),
    body: { title: "Complete array practice", priority: "HIGH" },
  });
  assert.equal(taskResponse.status, 201);
  const task = (await taskResponse.json()).data;
  const completed = await request(`/me/plans/${plan.id}/tasks/${task.id}`, {
    ...authenticatedOptions(cookie, "PATCH"),
    body: { status: "COMPLETED" },
  });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).data.status, "COMPLETED");
  const deleted = await request(`/me/plans/${plan.id}/tasks/${task.id}`, {
    ...authenticatedOptions(cookie, "DELETE"),
  });
  assert.equal(deleted.status, 204);
  assert.equal(
    await getPrisma().studyTask.count({
      where: { id: task.id, plan: { studentProfileId: profile.id } },
    }),
    0,
  );
});

test("AI interview answers persist before provider evaluation and can be retried", async () => {
  const user = await seedUser();
  const { cookie } = await loginUser(user);
  const env = {
    url: process.env.LLM_API_URL,
    key: process.env.LLM_API_KEY,
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
  };
  let sessionId;
  try {
    delete process.env.LLM_API_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.LLM_PROVIDER = "none";
    const created = await request("/me/interviews", {
      ...authenticatedOptions(cookie, "POST"),
      body: {
        targetRole: "Backend Engineer",
        experienceLevel: "INTERMEDIATE",
        type: "TECHNICAL",
        difficulty: "MEDIUM",
        questionCount: 1,
        durationMinutes: 15,
        topics: ["Databases"],
        resumeBased: false,
      },
    });
    assert.equal(created.status, 201);
    sessionId = (await created.json()).data.id;
    const started = await request(
      `/me/interviews/${sessionId}/start`,
      authenticatedOptions(cookie, "POST"),
    );
    assert.equal(started.status, 202);
    const questionId = (await started.json()).data.questions[0].id;

    process.env.LLM_API_URL = `http://127.0.0.1:${emailServer.address().port}/fail`;
    process.env.LLM_API_KEY = "test-ai-key";
    process.env.LLM_PROVIDER = "openai-compatible";
    const answerInput = {
      questionId,
      text: "I would compare query plans, add an appropriate index, and measure the latency change.",
    };
    const failedEvaluation = await request(
      `/me/interviews/${sessionId}/answers`,
      {
        ...authenticatedOptions(cookie, "POST"),
        body: answerInput,
      },
    );
    assert.equal(failedEvaluation.status, 503);
    assert.equal(
      (await failedEvaluation.json()).error.code,
      "LLM_UNAVAILABLE",
    );
    const savedAnswer = await getPrisma().interviewAnswer.findUnique({
      where: {
        questionId_participantUserId: {
          questionId,
          participantUserId: user.id,
        },
      },
    });
    assert.equal(savedAnswer.text, answerInput.text);

    delete process.env.LLM_API_URL;
    delete process.env.LLM_API_KEY;
    process.env.LLM_PROVIDER = "none";
    const retried = await request(`/me/interviews/${sessionId}/answers`, {
      ...authenticatedOptions(cookie, "POST"),
      body: answerInput,
    });
    const result = await retried.json();
    assert.equal(retried.status, 201);
    assert.equal(result.data.status, "COMPLETED");
    assert.equal(result.data.questions[0].answers.length, 1);
    assert.equal(result.data.evaluations.length, 1);
  } finally {
    for (const [key, value] of Object.entries({
      LLM_API_URL: env.url,
      LLM_API_KEY: env.key,
      LLM_PROVIDER: env.provider,
      LLM_MODEL: env.model,
      GEMINI_API_KEY: env.geminiKey,
      GEMINI_MODEL: env.geminiModel,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (sessionId)
      await getPrisma().interviewSession.delete({ where: { id: sessionId } });
  }
});

async function loginUser(user, password = testPassword) {
  const response = await request("/auth/login", {
    method: "POST",
    body: { email: user.email, password },
  });
  return { response, cookie: cookiePairs(response) };
}

function authenticatedOptions(cookie, method = "GET") {
  return {
    method,
    cookie,
    csrf: readCookie(cookie, "career_csrf"),
  };
}

test("unauthenticated requests are rejected and public admin registration is rejected", async () => {
  const unauthenticated = await request("/auth/me");
  assert.equal(unauthenticated.status, 401);
  const admin = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Platform Admin",
      email: `admin-${crypto.randomUUID()}@example.test`,
      password: testPassword,
      confirmPassword: testPassword,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "ADMIN",
    },
  });
  assert.equal(admin.status, 400);
});

test("auth mutations enforce exact origin and CSRF validation", async () => {
  const missingOrigin = await request("/auth/logout", {
    method: "POST",
    originHeader: null,
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).error.code, "ORIGIN_NOT_ALLOWED");

  const missingCsrf = await request("/auth/logout", { method: "POST" });
  assert.equal(missingCsrf.status, 403);
  assert.equal((await missingCsrf.json()).error.code, "CSRF_INVALID");

  const csrfResponse = await request("/auth/csrf");
  assert.equal(csrfResponse.status, 200);
  assert.equal(csrfResponse.headers.get("cache-control"), "no-store");
  const csrfCookie = cookiePairs(csrfResponse);
  const csrfToken = (await csrfResponse.json()).data.csrfToken;
  assert.equal(readCookie(csrfCookie, "career_csrf"), csrfToken);
  const logout = await request("/auth/logout", {
    method: "POST",
    cookie: csrfCookie,
    csrf: csrfToken,
  });
  assert.equal(logout.status, 204);

  const untrustedOrigin = await request("/auth/login", {
    method: "POST",
    originHeader: "https://attacker.example",
    body: { email: "attacker@example.test", password: testPassword },
  });
  assert.equal(untrustedOrigin.status, 403);
});

test("student registration requires consent and stores an Argon2id hash without starting a session", async () => {
  const email = `student-${crypto.randomUUID()}@Example.test`;
  trackEmail(email);
  const password = testPassword;
  const response = await request("/auth/register/student", {
    method: "POST",
    body: {
      fullName: "Taylor Student",
      email,
      password,
      confirmPassword: password,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    },
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.status, "PENDING");
  assert.equal(body.data.email, email.toLowerCase());
  assert.equal(body.data.role, "STUDENT");
  assert.equal(JSON.stringify(body).includes(password), false);

  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email.toLowerCase() },
    include: {
      studentProfile: true,
      consents: true,
      sessions: true,
      tokenFamilies: true,
    },
  });
  assert.ok(user);
  assert.match(user.passwordHash, /^\$argon2id\$/);
  assert.equal(user.emailVerifiedAt, null);
  assert.equal(user.studentProfile.firstName, "Taylor");
  assert.equal(user.studentProfile.lastName, "Student");
  assert.deepEqual(
    user.consents
      .map(({ type, status }) => ({ type, status }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    [
      { type: "PLATFORM_TERMS", status: "GRANTED" },
      { type: "PRIVACY_POLICY", status: "GRANTED" },
    ],
  );
  assert.equal(user.sessions.length, 0);
  assert.equal(user.tokenFamilies.length, 0);
  assert.equal(
    await getPrisma().emailVerificationToken.count({
      where: { userId: user.id, usedAt: null },
    }),
    1,
  );
  assert.ok(emailTokenFor(user.email, "Verify your CareerPrepAI email"));

  const audit = await getPrisma().auditLog.findFirst({
    where: { action: "AUTH_REGISTERED", resourceId: user.id },
    select: { after: true },
  });
  assert.deepEqual(audit.after, {
    role: "STUDENT",
    status: "PENDING",
  });
});

test("email verification activates an account once and enables password sign-in", async () => {
  const email = `verify-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Verification User",
      email,
      password: testPassword,
      confirmPassword: testPassword,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    },
  });
  assert.equal(registration.status, 201);
  const token = emailTokenFor(
    email.toLowerCase(),
    "Verify your CareerPrepAI email",
  );
  const tokenHash = crypto
    .createHmac("sha256", validateEnv().SESSION_TOKEN_PEPPER)
    .update(token)
    .digest("hex");

  const verified = await request("/auth/verify-email", {
    method: "POST",
    body: { token },
  });
  assert.equal(verified.status, 200);
  assert.deepEqual((await verified.json()).data, { verified: true });
  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email },
    include: { emailVerificationTokens: true },
  });
  assert.equal(user.status, "ACTIVE");
  assert.ok(user.emailVerifiedAt);
  assert.ok(
    user.emailVerificationTokens.find((item) => item.tokenHash === tokenHash)
      .usedAt,
  );
  assert.equal(
    (await request("/auth/verify-email", { method: "POST", body: { token } }))
      .status,
    400,
  );
  assert.equal((await loginUser(user)).response.status, 200);
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_EMAIL_VERIFIED", resourceId: user.id },
    }),
    1,
  );
});

test("Google OIDC verifies state, nonce, PKCE and consent before creating a student session", async (t) => {
  const restore = configureGoogleOAuth();
  t.after(restore);
  const email = `google-${crypto.randomUUID()}@example.test`;
  const subject = `google-sub-${crypto.randomUUID()}`;
  trackEmail(email);
  const client = fakeGoogleClient({
    email,
    email_verified: true,
    iss: "https://accounts.google.com",
    name: "Google Student",
    picture: "https://images.example.test/student.png",
    sub: subject,
  });
  t.mock.method(googleOAuth, "createGoogleOAuthClient", () => client);

  const transaction = await beginGoogleOAuth(client, {
    acceptedTerms: true,
    acceptedPrivacyPolicy: true,
  });
  const callback = await request(
    `/auth/google/callback?code=mock-code&state=${transaction.state}`,
    {
      cookie: transaction.cookies,
      originHeader: null,
      redirect: "manual",
    },
  );
  assert.equal(callback.status, 302);
  assert.equal(
    callback.headers.get("location"),
    `${new URL(process.env.FRONTEND_ORIGIN).origin}/student/profile`,
  );
  const exchange = client.getExchange();
  assert.equal(exchange.code, "mock-code");
  assert.equal(
    crypto
      .createHash("sha256")
      .update(exchange.codeVerifier)
      .digest("base64url"),
    transaction.codeChallenge,
  );

  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email },
    include: { oauthAccounts: true, studentProfile: true, consents: true },
  });
  assert.equal(user.role, "STUDENT");
  assert.equal(user.status, "ACTIVE");
  assert.ok(user.emailVerifiedAt);
  assert.equal(user.passwordHash, null);
  assert.equal(user.studentProfile.firstName, "Google");
  assert.equal(user.oauthAccounts.length, 1);
  assert.equal(user.oauthAccounts[0].providerAccountId, subject);
  assert.equal(user.consents.length, 2);
  assert.equal(
    await getPrisma().userSession.count({
      where: { userId: user.id, revokedAt: null },
    }),
    1,
  );
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_OAUTH_REGISTERED", resourceId: user.id },
    }),
    1,
  );
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_OAUTH_LOGIN", resourceId: user.id },
    }),
    1,
  );
  const authenticated = await request("/auth/me", {
    cookie: cookiePairs(callback),
  });
  assert.equal(authenticated.status, 200);
});

test("Google OAuth does not link existing email accounts and requires consent for new accounts", async (t) => {
  const restore = configureGoogleOAuth();
  t.after(restore);
  const existing = await seedUser();
  let client = fakeGoogleClient({
    email: existing.email,
    email_verified: true,
    iss: "accounts.google.com",
    sub: `google-sub-${crypto.randomUUID()}`,
  });
  t.mock.method(googleOAuth, "createGoogleOAuthClient", () => client);
  const existingTransaction = await beginGoogleOAuth(client);
  const existingCallback = await request(
    `/auth/google/callback?code=mock-code&state=${existingTransaction.state}`,
    {
      cookie: existingTransaction.cookies,
      originHeader: null,
      redirect: "manual",
    },
  );
  assert.equal(existingCallback.status, 302);
  assert.match(
    existingCallback.headers.get("location"),
    /\/login\?oauth=link-required$/,
  );
  assert.equal(
    await getPrisma().oAuthAccount.count({ where: { userId: existing.id } }),
    0,
  );
  assert.equal(
    await getPrisma().userSession.count({ where: { userId: existing.id } }),
    0,
  );

  const email = `google-consent-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  client = fakeGoogleClient({
    email,
    email_verified: true,
    iss: "https://accounts.google.com",
    sub: `google-sub-${crypto.randomUUID()}`,
  });
  const newTransaction = await beginGoogleOAuth(client);
  const newCallback = await request(
    `/auth/google/callback?code=mock-code&state=${newTransaction.state}`,
    {
      cookie: newTransaction.cookies,
      originHeader: null,
      redirect: "manual",
    },
  );
  assert.equal(newCallback.status, 302);
  assert.match(
    newCallback.headers.get("location"),
    /\/register\?oauth=consent-required$/,
  );
  assert.equal(
    await getPrisma().user.count({ where: { emailNormalized: email } }),
    0,
  );
});

test("Firebase Google linking requires a verified existing email", async (t) => {
  const restoreProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = "test-firebase-project";
  t.after(() => {
    if (restoreProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = restoreProject;
  });
  const existing = await seedUser({ status: "PENDING" });
  t.mock.method(firebaseAuth, "verifyFirebaseGoogleToken", async () => ({
    email: existing.email,
    email_verified: true,
    name: "Unverified Existing",
    sub: `firebase-sub-${crypto.randomUUID()}`,
  }));

  const response = await request("/auth/firebase/google", {
    method: "POST",
    body: {
      idToken: "firebase-test-token-1234567890",
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "RECRUITER",
    },
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "ACCOUNT_LINK_REQUIRES_VERIFIED_EMAIL");
  assert.equal(
    await getPrisma().oAuthAccount.count({ where: { userId: existing.id } }),
    0,
  );
});

test("Firebase Google registration honors the selected onboarding role", async (t) => {
  const restoreProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = "test-firebase-project";
  t.after(() => {
    if (restoreProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = restoreProject;
  });
  const email = `firebase-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  t.mock.method(firebaseAuth, "verifyFirebaseGoogleToken", async () => ({
    email,
    email_verified: true,
    name: "Firebase Recruiter",
    sub: `firebase-sub-${crypto.randomUUID()}`,
  }));

  const response = await request("/auth/firebase/google", {
    method: "POST",
    body: {
      idToken: "firebase-test-token-1234567890",
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "RECRUITER",
    },
  });
  assert.equal(response.status, 200);
  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email },
    include: { recruiterProfile: true, studentProfile: true },
  });
  assert.equal(user.role, "RECRUITER");
  assert.ok(user.recruiterProfile);
  assert.equal(user.studentProfile, null);
  assert.equal(
    await getPrisma().securityEvent.count({
      where: { userId: user.id, type: "NEW_LOGIN_DEVICE" },
    }),
    0,
  );
});

test("Firebase Google ignores a requested role for an existing user", async (t) => {
  const restoreProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = "test-firebase-project";
  t.after(() => {
    if (restoreProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = restoreProject;
  });
  const existing = await seedUser();
  t.mock.method(firebaseAuth, "verifyFirebaseGoogleToken", async () => ({
    email: existing.email,
    email_verified: true,
    sub: `firebase-sub-${crypto.randomUUID()}`,
  }));
  const response = await request("/auth/firebase/google", {
    method: "POST",
    body: {
      idToken: "firebase-test-token-1234567890",
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "RECRUITER",
    },
  });
  assert.equal(response.status, 200);
  const unchanged = await getPrisma().user.findUnique({ where: { id: existing.id } });
  assert.equal(unchanged.role, "STUDENT");
});

test("Firebase rejects ADMIN and other invalid onboarding roles", async (t) => {
  const restoreProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = "test-firebase-project";
  t.after(() => {
    if (restoreProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = restoreProject;
  });
  const response = await request("/auth/firebase/google", {
    method: "POST",
    body: {
      idToken: "firebase-test-token-1234567890",
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "ADMIN",
    },
  });
  assert.equal(response.status, 400);
});

test("Firebase ignores client email_verified input and uses the verified server claim", async (t) => {
  const restoreProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = "test-firebase-project";
  t.after(() => {
    if (restoreProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = restoreProject;
  });
  const email = `firebase-claim-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  t.mock.method(firebaseAuth, "verifyFirebaseGoogleToken", async () => ({
    email,
    email_verified: true,
    name: "Verified Firebase User",
    sub: `firebase-sub-${crypto.randomUUID()}`,
  }));
  const response = await request("/auth/firebase/google", {
    method: "POST",
    body: {
      idToken: "firebase-test-token-1234567890",
      email_verified: false,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "STUDENT",
    },
  });
  assert.equal(response.status, 200);
});

test("password failures use one generic response and cap lockout at 15 minutes", async () => {
  const user = await seedUser();
  const responses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    responses.push(await request("/auth/login", {
      method: "POST",
      body: { email: user.email, password: "Wrong-Passphrase-2030!" },
    }));
  }
  assert.ok(responses.slice(0, 4).every((response) => response.status === 401));
  assert.equal(responses[4].status, 401);
  const lockedUser = await getPrisma().user.findUnique({ where: { id: user.id } });
  assert.equal(lockedUser.failedLoginAttempts, 5);
  assert.ok(lockedUser.loginLockedUntil > new Date());
  assert.ok(lockedUser.loginLockedUntil <= new Date(Date.now() + 15 * 60 * 1000));
  const unknown = await request("/auth/login", {
    method: "POST",
    body: { email: `unknown-${crypto.randomUUID()}@example.test`, password: "Wrong-Passphrase-2030!" },
  });
  const wrong = await request("/auth/login", {
    method: "POST",
    body: { email: user.email, password: "Wrong-Passphrase-2030!" },
  });
  const blocked = await request("/auth/login", {
    method: "POST",
    body: { email: user.email, password: testPassword },
  });
  assert.equal(blocked.status, 401);
  const unknownBody = await unknown.json();
  const wrongBody = await wrong.json();
  const blockedBody = await blocked.json();
  assert.deepEqual(unknownBody, wrongBody);
  assert.deepEqual(wrongBody, blockedBody);
});

test("a new device creates a security event and sends a generic alert", async () => {
  const user = await seedUser();
  const first = await loginUser(user, testPassword);
  assert.equal(first.response.status, 200);
  const second = await request("/auth/login", {
    method: "POST",
    headers: { "user-agent": "CareerPrepAI-Test-New-Device" },
    body: { email: user.email, password: testPassword },
  });
  assert.equal(second.status, 200);
  const sessions = await getPrisma().userSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(sessions.length, 2);
  assert.match(sessions[1].ipAddress, /^[a-f0-9]{64}$/);
  assert.match(sessions[1].userAgent, /^[a-f0-9]{64}$/);
  assert.notEqual(sessions[1].userAgent, "CareerPrepAI-Test-New-Device");
  assert.equal(
    await getPrisma().securityEvent.count({
      where: { userId: user.id, type: "NEW_LOGIN_DEVICE" },
    }),
    1,
  );
  assert.ok(
    deliveredEmails.some(
      (email) => email.to === user.email && email.subject === "New CareerPrepAI sign-in detected",
    ),
  );
});

test("first login and alert delivery failure do not fail authentication", async () => {
  const user = await seedUser();
  const first = await loginUser(user);
  assert.equal(first.response.status, 200);
  assert.equal(
    await getPrisma().securityEvent.count({
      where: { userId: user.id, type: "NEW_LOGIN_DEVICE" },
    }),
    0,
  );
  const workingUrl = process.env.EMAIL_API_URL;
  process.env.EMAIL_API_URL = workingUrl.replace("/send", "/fail");
  try {
    const second = await request("/auth/login", {
      method: "POST",
      headers: { "user-agent": "CareerPrepAI-Alert-Failure-Device" },
      body: { email: user.email, password: testPassword },
    });
    assert.equal(second.status, 200);
  } finally {
    process.env.EMAIL_API_URL = workingUrl;
  }
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_SECURITY_ALERT_EMAIL_FAILED", resourceId: user.id },
    }),
    1,
  );
});

test("each successful login creates a fresh session", async () => {
  const user = await seedUser();
  await getPrisma().user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 2, loginLockedUntil: new Date(Date.now() - 60_000) },
  });
  const first = await loginUser(user);
  const second = await loginUser(user);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.notEqual(first.cookie, second.cookie);
  assert.equal(
    await getPrisma().userSession.count({
      where: { userId: user.id, revokedAt: null },
    }),
    2,
  );
  const updatedUser = await getPrisma().user.findUnique({ where: { id: user.id } });
  assert.equal(updatedUser.failedLoginAttempts, 0);
  assert.equal(updatedUser.loginLockedUntil, null);
});

test("registration reports provider failure and allows a later verification resend", async () => {
  const email = `mail-failure-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  const workingUrl = process.env.EMAIL_API_URL;
  process.env.EMAIL_API_URL = workingUrl.replace("/send", "/fail");
  let registration;
  try {
    registration = await request("/auth/register", {
      method: "POST",
      body: {
        name: "Mail Failure User",
        email,
        password: testPassword,
        confirmPassword: testPassword,
        acceptedTerms: true,
        acceptedPrivacyPolicy: true,
      },
    });
  } finally {
    process.env.EMAIL_API_URL = workingUrl;
  }
  assert.equal(registration.status, 503);
  assert.equal((await registration.json()).error.code, "EMAIL_PROVIDER_FAILED");
  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email },
    include: { emailVerificationTokens: true },
  });
  assert.equal(user.status, "PENDING");
  assert.ok(user.emailVerificationTokens.every((item) => item.usedAt));
  assert.equal((await loginUser(user)).response.status, 401);

  const resend = await request("/auth/resend-verification", {
    method: "POST",
    body: { email },
  });
  assert.equal(resend.status, 202);
  const token = emailTokenFor(email, "Verify your CareerPrepAI email");
  assert.equal(
    (await request("/auth/verify-email", { method: "POST", body: { token } }))
      .status,
    200,
  );
});

test("password reset is non-enumerating, one-time, and revokes existing sessions", async () => {
  const user = await seedUser();
  const firstLogin = await loginUser(user);
  const secondLogin = await loginUser(user);
  assert.equal(firstLogin.response.status, 200);
  assert.equal(secondLogin.response.status, 200);
  await getPrisma().user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 5, loginLockedUntil: new Date(Date.now() + 60_000) },
  });

  const known = await request("/auth/password-reset/request", {
    method: "POST",
    body: { email: user.email },
  });
  const unknown = await request("/auth/password-reset/request", {
    method: "POST",
    body: { email: `missing-${crypto.randomUUID()}@example.test` },
  });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  const deliveryFailure = await getPrisma().auditLog.findMany({
    where: { action: "AUTH_EMAIL_DELIVERY_FAILED", resourceId: user.id },
    select: { after: true },
  });
  assert.deepEqual(deliveryFailure, []);

  const token = emailTokenFor(user.email, "Reset your CareerPrepAI password");
  const tokenHash = crypto
    .createHmac("sha256", validateEnv().SESSION_TOKEN_PEPPER)
    .update(token)
    .digest("hex");
  const storedToken = await getPrisma().passwordResetToken.findUnique({
    where: { tokenHash },
  });
  assert.ok(storedToken);
  assert.notEqual(storedToken.tokenHash, token);

  const newPassword = "Another-Valid-Passphrase-2031!";
  const reset = await request("/auth/password-reset/confirm", {
    method: "POST",
    body: { token, password: newPassword, confirmPassword: newPassword },
  });
  assert.equal(reset.status, 204);
  assert.equal(
    (
      await request("/auth/password-reset/confirm", {
        method: "POST",
        body: { token, password: newPassword, confirmPassword: newPassword },
      })
    ).status,
    400,
  );
  const resetUser = await getPrisma().user.findUnique({ where: { id: user.id } });
  assert.equal(resetUser.failedLoginAttempts, 0);
  assert.equal(resetUser.loginLockedUntil, null);
  assert.equal(
    (await request("/auth/me", { cookie: firstLogin.cookie })).status,
    401,
  );
  assert.equal(
    (await request("/auth/me", { cookie: secondLogin.cookie })).status,
    401,
  );
  assert.equal((await loginUser(user)).response.status, 401);
  const refreshedUser = await getPrisma().user.findUnique({
    where: { id: user.id },
  });
  assert.equal(
    (await loginUser(refreshedUser, newPassword)).response.status,
    200,
  );
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_PASSWORD_RESET", resourceId: user.id },
    }),
    1,
  );
});

test("authenticated password change verifies the current password and invalidates every session", async () => {
  const user = await seedUser();
  const active = await loginUser(user);
  const other = await loginUser(user);
  const wrongPassword = await request("/auth/password/change", {
    ...authenticatedOptions(active.cookie, "POST"),
    body: {
      currentPassword: "Wrong-Current-Passphrase-2030!",
      password: "Changed-Valid-Passphrase-2032!",
      confirmPassword: "Changed-Valid-Passphrase-2032!",
    },
  });
  assert.equal(wrongPassword.status, 400);

  const newPassword = "Changed-Valid-Passphrase-2032!";
  const changed = await request("/auth/password/change", {
    ...authenticatedOptions(active.cookie, "POST"),
    body: {
      currentPassword: testPassword,
      password: newPassword,
      confirmPassword: newPassword,
    },
  });
  assert.equal(changed.status, 204);
  assert.equal(
    (await request("/auth/me", { cookie: other.cookie })).status,
    401,
  );
  const refreshedUser = await getPrisma().user.findUnique({
    where: { id: user.id },
  });
  assert.equal(
    (await loginUser(refreshedUser, newPassword)).response.status,
    200,
  );
  assert.equal(
    await getPrisma().auditLog.count({
      where: { action: "AUTH_PASSWORD_CHANGED", resourceId: user.id },
    }),
    1,
  );
});

test("recruiter registration creates no company privileges or session", async () => {
  const email = `recruiter-${crypto.randomUUID()}@example.test`;
  trackEmail(email);
  const response = await request("/auth/register/recruiter", {
    method: "POST",
    body: {
      name: "Jordan Recruiter",
      email,
      password: testPassword,
      confirmPassword: testPassword,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    },
  });
  assert.equal(response.status, 201);

  const user = await getPrisma().user.findUnique({
    where: { emailNormalized: email.toLowerCase() },
    include: { recruiterProfile: true, companyMembers: true, sessions: true },
  });
  assert.equal(user.role, "RECRUITER");
  assert.ok(user.recruiterProfile);
  assert.equal(user.companyMembers.length, 0);
  assert.equal(user.sessions.length, 0);
});

test("registration validation errors do not echo submitted password values", async () => {
  const uniqueEmail = `invalid-${crypto.randomUUID()}@example.test`;
  const weakPassword = "ObviousWeakPasswordValue";
  const response = await request("/auth/register", {
    method: "POST",
    body: {
      fullName: "Invalid User",
      email: uniqueEmail,
      password: weakPassword,
      confirmPassword: "different",
      acceptedTerms: false,
      acceptedPrivacyPolicy: true,
    },
  });
  const text = await response.text();
  assert.equal(response.status, 400);
  assert.equal(text.includes(weakPassword), false);
  assert.equal(text.includes("different"), false);
});

test("password login creates an opaque-token session and sets HTTP-only cookies", async () => {
  const user = await seedUser();
  const { response, cookie } = await loginUser(user);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, user.id);
  assert.equal(body.data.role, "STUDENT");
  assert.equal(JSON.stringify(body).includes("career_refresh"), false);
  assert.ok(readCookie(cookie, "career_access"));
  assert.ok(readCookie(cookie, "career_refresh"));
  assert.ok(readCookie(cookie, "career_csrf"));

  const setCookies = response.headers.getSetCookie();
  assert.ok(
    setCookies.some(
      (value) => value.startsWith("career_access=") && /HttpOnly/i.test(value),
    ),
  );
  assert.ok(
    setCookies.some(
      (value) => value.startsWith("career_refresh=") && /HttpOnly/i.test(value),
    ),
  );
  assert.ok(
    setCookies.some(
      (value) => value.startsWith("career_csrf=") && !/HttpOnly/i.test(value),
    ),
  );
  assert.ok(setCookies.every((value) => /SameSite=Lax/i.test(value)));

  const [session] = await getPrisma().userSession.findMany({
    where: { userId: user.id },
    include: { tokenFamily: { include: { refreshTokens: true } } },
  });
  assert.ok(session?.tokenFamily);
  assert.equal(session.tokenFamily.refreshTokens.length, 1);
  const refreshValue = readCookie(cookie, "career_refresh");
  assert.notEqual(session.tokenFamily.refreshTokens[0].tokenHash, refreshValue);
  assert.match(
    session.tokenFamily.refreshTokens[0].tokenHash,
    /^[a-f0-9]{64}$/,
  );
});

test("expired access tokens are rejected even when correctly signed", async () => {
  const user = await seedUser();
  const expiredAccess = jwt.sign(
    { sid: crypto.randomUUID() },
    validateEnv().ACCESS_TOKEN_SECRET,
    {
      algorithm: "HS256",
      audience: "careerprepai-web",
      expiresIn: -1,
      issuer: "careerprepai",
      jwtid: crypto.randomUUID(),
      subject: user.id,
    },
  );
  const response = await request("/auth/me", {
    cookie: `career_access=${expiredAccess}`,
  });
  assert.equal(response.status, 401);
});

test("successful legacy bcrypt login upgrades the stored password hash", async () => {
  const user = await seedUser({ legacyBcrypt: true });
  const { response } = await loginUser(user);
  assert.equal(response.status, 200);
  const refreshedUser = await getPrisma().user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  assert.match(refreshedUser.passwordHash, /^\$argon2id\$/);
});

test("login failures are generic for unknown, OAuth-only, pending, suspended and deleted accounts", async () => {
  const oauthEmail = `oauth-${crypto.randomUUID()}@example.test`;
  trackEmail(oauthEmail);
  const oauthUser = await getPrisma().user.create({
    data: {
      email: oauthEmail,
      emailNormalized: oauthEmail,
      fullName: "OAuth User",
      role: "STUDENT",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      oauthAccounts: {
        create: { provider: "GOOGLE", providerAccountId: crypto.randomUUID() },
      },
    },
  });
  const pending = await seedUser({ status: "PENDING" });
  const suspended = await seedUser({ status: "SUSPENDED" });
  const deleted = await seedUser({ status: "DELETED" });
  const attempts = [
    await request("/auth/login", {
      method: "POST",
      body: {
        email: `missing-${crypto.randomUUID()}@example.test`,
        password: testPassword,
      },
    }),
    await request("/auth/login", {
      method: "POST",
      body: { email: oauthUser.email, password: testPassword },
    }),
    await request("/auth/login", {
      method: "POST",
      body: { email: pending.email, password: testPassword },
    }),
    await request("/auth/login", {
      method: "POST",
      body: { email: suspended.email, password: testPassword },
    }),
    await request("/auth/login", {
      method: "POST",
      body: { email: deleted.email, password: testPassword },
    }),
  ];
  const results = await Promise.all(
    attempts.map((response) => response.json()),
  );
  assert.ok(attempts.every((response) => response.status === 401));
  assert.deepEqual(
    new Set(results.map((result) => result.error.message)),
    new Set(["Invalid email or password."]),
  );

  const failureAudits = await getPrisma().auditLog.findMany({
    where: {
      action: "AUTH_LOGIN_FAILURE",
      resourceId: { in: [oauthUser.id, pending.id, suspended.id, deleted.id] },
    },
    select: { after: true },
  });
  assert.ok(
    failureAudits.every(
      ({ after }) =>
        JSON.stringify(after) === JSON.stringify({ result: "failure" }),
    ),
  );
});

test("SYSTEM principals cannot use interactive user sessions", async () => {
  const system = await seedUser({ role: "SYSTEM" });
  const response = await request("/auth/login", {
    method: "POST",
    body: { email: system.email, password: testPassword },
  });
  assert.equal(response.status, 401);
  const sessions = await getPrisma().userSession.count({ where: { userId: system.id } });
  assert.equal(sessions, 0);
});

test("session listing and revocation are user-scoped and revoke the refresh family", async () => {
  const user = await seedUser();
  const { response: loginResponse, cookie } = await loginUser(user);
  assert.equal(loginResponse.status, 200);
  const listing = await request("/auth/sessions", authenticatedOptions(cookie));
  assert.equal(listing.status, 200);
  const sessions = (await listing.json()).data;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].current, true);
  assert.equal(Object.hasOwn(sessions[0], "sessionTokenHash"), false);

  const revoked = await request(
    `/auth/sessions/${sessions[0].id}`,
    authenticatedOptions(cookie, "DELETE"),
  );
  assert.equal(revoked.status, 204);
  const authMe = await request("/auth/me", { cookie });
  assert.equal(authMe.status, 401);
  const session = await getPrisma().userSession.findUnique({
    where: { id: sessions[0].id },
    include: { tokenFamily: { include: { refreshTokens: true } } },
  });
  assert.ok(session.revokedAt);
  assert.ok(session.tokenFamily.revokedAt);
  assert.ok(
    session.tokenFamily.refreshTokens.every((token) => token.revokedAt),
  );
});

test("refresh rotation links replacements and reuse revokes the family", async () => {
  const user = await seedUser();
  const { response: loginResponse, cookie } = await loginUser(user);
  assert.equal(loginResponse.status, 200);
  const oldRefresh = readCookie(cookie, "career_refresh");
  const rotated = await request("/auth/refresh", {
    method: "POST",
    cookie,
    csrf: readCookie(cookie, "career_csrf"),
  });
  assert.equal(rotated.status, 200);
  const nextCookie = cookiePairs(rotated);
  const newRefresh = readCookie(nextCookie, "career_refresh");
  assert.ok(newRefresh);
  assert.notEqual(newRefresh, oldRefresh);
  assert.equal(
    JSON.stringify(await rotated.json()).includes(newRefresh),
    false,
  );

  const oldTokenRow = await getPrisma().refreshToken.findUnique({
    where: {
      tokenHash: crypto
        .createHmac("sha256", validateEnv().SESSION_TOKEN_PEPPER)
        .update(oldRefresh)
        .digest("hex"),
    },
  });
  assert.ok(oldTokenRow.revokedAt);
  assert.ok(oldTokenRow.replacedById);

  const reuse = await request("/auth/refresh", {
    method: "POST",
    cookie: `career_refresh=${oldRefresh}; career_csrf=${readCookie(cookie, "career_csrf")}`,
    csrf: readCookie(cookie, "career_csrf"),
  });
  assert.equal(reuse.status, 401);
  const family = await getPrisma().tokenFamily.findUnique({
    where: { id: oldTokenRow.familyId },
    include: { session: true, refreshTokens: true },
  });
  assert.ok(family.revokedAt);
  assert.ok(family.session.revokedAt);
  assert.ok(family.refreshTokens.every((token) => token.revokedAt));
  assert.equal(
    await getPrisma().securityEvent.count({
      where: { userId: user.id, type: "REFRESH_TOKEN_REUSE" },
    }),
    1,
  );
});

test("concurrent refreshes cannot produce two active token chains", async () => {
  const user = await seedUser();
  const { response: loginResponse, cookie } = await loginUser(user);
  assert.equal(loginResponse.status, 200);
  const body = {
    method: "POST",
    cookie,
    csrf: readCookie(cookie, "career_csrf"),
  };
  const responses = await Promise.all([
    request("/auth/refresh", body),
    request("/auth/refresh", body),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 401]);

  const family = await getPrisma().tokenFamily.findFirst({
    where: { userId: user.id },
    include: { refreshTokens: true },
  });
  assert.ok(family.revokedAt);
  assert.ok(family.refreshTokens.every((token) => token.revokedAt));
  assert.equal(
    family.refreshTokens.filter((token) => !token.revokedAt).length,
    0,
  );
});

test("logout revokes one session and logout-all revokes every remaining session", async () => {
  const user = await seedUser();
  const firstLogin = await loginUser(user);
  const secondLogin = await loginUser(user);
  assert.equal(firstLogin.response.status, 200);
  assert.equal(secondLogin.response.status, 200);

  const logout = await request("/auth/logout", {
    method: "POST",
    cookie: firstLogin.cookie,
    csrf: readCookie(firstLogin.cookie, "career_csrf"),
  });
  assert.equal(logout.status, 204);
  const sessionsAfterLogout = await getPrisma().userSession.findMany({
    where: { userId: user.id },
    include: { tokenFamily: true },
  });
  assert.equal(
    sessionsAfterLogout.filter((session) => session.revokedAt).length,
    1,
  );
  assert.equal(
    sessionsAfterLogout.filter((session) => !session.revokedAt).length,
    1,
  );

  const logoutAll = await request("/auth/logout-all", {
    ...authenticatedOptions(secondLogin.cookie, "POST"),
  });
  assert.equal(logoutAll.status, 204);
  const sessionsAfterLogoutAll = await getPrisma().userSession.findMany({
    where: { userId: user.id },
    include: { tokenFamily: { include: { refreshTokens: true } } },
  });
  assert.ok(
    sessionsAfterLogoutAll.every(
      (session) => session.revokedAt && session.tokenFamily.revokedAt,
    ),
  );
  assert.ok(
    sessionsAfterLogoutAll.every((session) =>
      session.tokenFamily.refreshTokens.every((token) => token.revokedAt),
    ),
  );
});

test("login rate limiting is enforced per account", async () => {
  const email = `limited-${crypto.randomUUID()}@example.test`;
  const responses = [];
  for (let attempt = 0; attempt < 9; attempt += 1) {
    responses.push(
      await request("/auth/login", {
        method: "POST",
        body: { email, password: testPassword },
      }),
    );
  }
  assert.ok(responses.slice(0, 8).every((response) => response.status === 401));
  assert.equal(responses[8].status, 429);
  assert.ok(Number(responses[8].headers.get("retry-after")) > 0);
});

test("all student profile and resume surfaces reject unauthenticated access", async () => {
  const paths = [
    "/me/profile",
    "/me/education",
    "/me/projects",
    "/me/experience",
    "/me/certifications",
    "/me/skills",
    "/me/resumes",
    "/me/resume-versions/not-a-real-version/download",
    "/me/interviews",
    "/me/interviews/dashboard",
    "/me/notifications",
    "/me/notifications/preferences",
    "/admin/dashboard",
    "/recruiter/dashboard",
  ];
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
  }
});
