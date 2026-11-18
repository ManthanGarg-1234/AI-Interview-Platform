# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.js >> CSRF rejects a state-changing request without the matching header
- Location: e2e\auth.spec.js:105:1

# Error details

```
TypeError: Cannot read properties of undefined (reading 'email')
```

# Test source

```ts
  1   | const { randomUUID } = require("node:crypto");
  2   | const { getPrisma } = require("../backend/prisma");
  3   | const { hashPassword } = require("../backend/services/password");
  4   | 
  5   | const projectId = "demo-careerprepai";
  6   | const emulatorUrl = "http://127.0.0.1:9099";
  7   | const backendUrl = "http://127.0.0.1:3001/api/v1";
  8   | const runId = process.env.E2E_RUN_ID || "manual";
  9   | const emailPrefix = `${runId}-`;
  10  | const password = "E2E-Valid-Passphrase-2038!";
  11  | 
  12  | function uniqueEmail(label) {
  13  |   return `${emailPrefix}${label}-${randomUUID()}@example.test`;
  14  | }
  15  | 
  16  | function base64Url(value) {
  17  |   return Buffer.from(JSON.stringify(value)).toString("base64url");
  18  | }
  19  | 
  20  | async function createGoogleToken({ email, name = "E2E Google User", sub = randomUUID() }) {
  21  |   const fakeGoogleToken = [
  22  |     base64Url({ alg: "none", typ: "JWT" }),
  23  |     base64Url({ email, email_verified: true, sub, name }),
  24  |     "",
  25  |   ].join(".");
  26  |   const response = await fetch(`${emulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key`, {
  27  |     method: "POST",
  28  |     headers: { "content-type": "application/json" },
  29  |     body: JSON.stringify({
  30  |       postBody: `id_token=${encodeURIComponent(fakeGoogleToken)}&providerId=google.com`,
  31  |       requestUri: "http://127.0.0.1:5174",
  32  |       returnSecureToken: true,
  33  |     }),
  34  |   });
  35  |   if (!response.ok) throw new Error(`Firebase emulator Google sign-in failed: ${await response.text()}`);
  36  |   const body = await response.json();
  37  |   return { idToken: body.idToken, localId: body.localId };
  38  | }
  39  | 
> 40  | async function createDatabaseUser({ email = uniqueEmail("account"), role = "STUDENT", verified = true }) {
      |                                     ^ TypeError: Cannot read properties of undefined (reading 'email')
  41  |   const prisma = getPrisma();
  42  |   const user = await prisma.user.create({
  43  |     data: {
  44  |       email,
  45  |       emailNormalized: email.toLowerCase(),
  46  |       fullName: `E2E ${role}`,
  47  |       passwordHash: await hashPassword(password),
  48  |       role,
  49  |       status: verified ? "ACTIVE" : "PENDING_VERIFICATION",
  50  |       emailVerifiedAt: verified ? new Date() : null,
  51  |       studentProfile: role === "STUDENT"
  52  |         ? { create: { firstName: "E2E", lastName: "Student" } }
  53  |         : undefined,
  54  |       recruiterProfile: role === "RECRUITER" ? { create: { jobTitle: "E2E Recruiter" } } : undefined,
  55  |     },
  56  |   });
  57  |   return { ...user, password };
  58  | }
  59  | 
  60  | async function cleanupDatabase() {
  61  |   const prisma = getPrisma();
  62  |   const users = await prisma.user.findMany({
  63  |     where: { emailNormalized: { startsWith: emailPrefix.toLowerCase() } },
  64  |     select: { id: true },
  65  |   });
  66  |   if (users.length) {
  67  |     await prisma.consentRecord.deleteMany({
  68  |       where: { userId: { in: users.map(({ id }) => id) } },
  69  |     });
  70  |   }
  71  |   await prisma.user.deleteMany({
  72  |     where: { emailNormalized: { startsWith: emailPrefix.toLowerCase() } },
  73  |   });
  74  | }
  75  | 
  76  | async function cleanupEmulator() {
  77  |   await fetch(`${emulatorUrl}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  78  | }
  79  | 
  80  | async function cleanupTestData() {
  81  |   await cleanupDatabase();
  82  |   await cleanupEmulator();
  83  | }
  84  | 
  85  | async function signInGoogle(page, idToken, role = "STUDENT") {
  86  |   await page.goto("/");
  87  |   const result = await page.evaluate(async ({ apiUrl, token, role }) => {
  88  |     const response = await fetch(`${apiUrl}/auth/firebase/google`, {
  89  |       method: "POST",
  90  |       credentials: "include",
  91  |       headers: { "content-type": "application/json" },
  92  |       body: JSON.stringify({
  93  |         idToken: token,
  94  |         acceptedTerms: true,
  95  |         acceptedPrivacyPolicy: true,
  96  |         role,
  97  |       }),
  98  |     });
  99  |     return { status: response.status, body: await response.json().catch(() => null) };
  100 |   }, { apiUrl: backendUrl, token: idToken, role });
  101 |   if (result.status !== 200) throw new Error(`Firebase browser exchange failed: ${JSON.stringify(result.body)}`);
  102 |   await page.goto(role === "RECRUITER" ? "/recruiter" : "/student");
  103 | }
  104 | 
  105 | async function signInPassword(page, user) {
  106 |   await page.goto("/login");
  107 |   await page.getByLabel("Email").fill(user.email);
  108 |   await page.getByLabel("Password").fill(user.password);
  109 |   await page.getByRole("button", { name: "Sign in", exact: true }).click();
  110 | }
  111 | 
  112 | async function apiFromPage(page, path, options = {}) {
  113 |   return page.evaluate(async ({ apiUrl, path: requestPath, options: requestOptions }) => {
  114 |     const response = await fetch(`${apiUrl}${requestPath}`, {
  115 |       ...requestOptions,
  116 |       credentials: "include",
  117 |       headers: { "content-type": "application/json", ...(requestOptions.headers || {}) },
  118 |     });
  119 |     return { status: response.status, body: await response.json().catch(() => null) };
  120 |   }, { apiUrl: backendUrl, path, options });
  121 | }
  122 | 
  123 | module.exports = {
  124 |   backendUrl,
  125 |   cleanupTestData,
  126 |   createDatabaseUser,
  127 |   createGoogleToken,
  128 |   password,
  129 |   signInGoogle,
  130 |   signInPassword,
  131 |   uniqueEmail,
  132 |   apiFromPage,
  133 | };
  134 | 
```