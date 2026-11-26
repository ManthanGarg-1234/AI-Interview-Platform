const { randomUUID } = require("node:crypto");
const { getPrisma } = require("../backend/prisma");
const { hashPassword } = require("../backend/services/password");

const projectId = "demo-careerprepai";
const emulatorUrl = "http://127.0.0.1:9099";
const backendUrl = "http://127.0.0.1:3001/api/v1";
const runId = process.env.E2E_RUN_ID || "manual";
const emailPrefix = `${runId}-`;
const password = "E2E-Valid-Passphrase-2038!";

function uniqueEmail(label) {
  return `${emailPrefix}${label}-${randomUUID()}@example.test`;
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function createGoogleToken({ email, name = "E2E Google User", sub = randomUUID() }) {
  const fakeGoogleToken = [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({ email, email_verified: true, sub, name }),
    "",
  ].join(".");
  const response = await fetch(`${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(fakeGoogleToken)}&providerId=google.com`,
      requestUri: "http://127.0.0.1:5174",
      returnSecureToken: true,
    }),
  });
  if (!response.ok) throw new Error(`Firebase emulator Google sign-in failed: ${await response.text()}`);
  const body = await response.json();
  return { idToken: body.idToken, localId: body.localId };
}

async function createDatabaseUser({ email = uniqueEmail("account"), role = "STUDENT", verified = true }) {
  const prisma = getPrisma();
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email.toLowerCase(),
      fullName: `E2E ${role}`,
      passwordHash: await hashPassword(password),
      role,
      status: verified ? "ACTIVE" : "PENDING",
      emailVerifiedAt: verified ? new Date() : null,
      studentProfile: role === "STUDENT"
        ? { create: { firstName: "E2E", lastName: "Student" } }
        : undefined,
      recruiterProfile: role === "RECRUITER" ? { create: { jobTitle: "E2E Recruiter" } } : undefined,
    },
  });
  return { ...user, password };
}

async function cleanupDatabase() {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { emailNormalized: { startsWith: emailPrefix.toLowerCase() } },
    select: { id: true },
  });
  if (users.length) {
    await prisma.consentRecord.deleteMany({
      where: { userId: { in: users.map(({ id }) => id) } },
    });
  }
  await prisma.user.deleteMany({
    where: { emailNormalized: { startsWith: emailPrefix.toLowerCase() } },
  });
}

async function cleanupEmulator() {
  await fetch(`${emulatorUrl}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
}

async function cleanupTestData() {
  await cleanupDatabase();
  await cleanupEmulator();
}

async function signInGoogle(page, idToken, role = "STUDENT") {
  await page.goto("/");
  const result = await page.evaluate(async ({ apiUrl, token, role }) => {
    const response = await fetch(`${apiUrl}/auth/firebase/google`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idToken: token,
        acceptedTerms: true,
        acceptedPrivacyPolicy: true,
        role,
      }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { apiUrl: backendUrl, token: idToken, role });
  if (result.status !== 200) throw new Error(`Firebase browser exchange failed: ${JSON.stringify(result.body)}`);
  await page.goto(role === "RECRUITER" ? "/recruiter" : "/student");
}

async function signInPassword(page, user) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function apiFromPage(page, path, options = {}) {
  return page.evaluate(async ({ apiUrl, path: requestPath, options: requestOptions }) => {
    const response = await fetch(`${apiUrl}${requestPath}`, {
      ...requestOptions,
      credentials: "include",
      headers: { "content-type": "application/json", ...(requestOptions.headers || {}) },
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { apiUrl: backendUrl, path, options });
}

module.exports = {
  backendUrl,
  cleanupTestData,
  createDatabaseUser,
  createGoogleToken,
  password,
  signInGoogle,
  signInPassword,
  uniqueEmail,
  apiFromPage,
};
