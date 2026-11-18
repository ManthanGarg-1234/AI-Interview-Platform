const { test, expect } = require("@playwright/test");
const {
  apiFromPage,
  cleanupTestData,
  createDatabaseUser,
  createGoogleToken,
  signInGoogle,
  signInPassword,
  uniqueEmail,
} = require("./helpers");

test.beforeEach(async () => {
  await cleanupTestData();
});

test.afterEach(async () => {
  await cleanupTestData();
});

test("new Google Student lands on the student dashboard", async ({ page }) => {
  const email = uniqueEmail("google-student");
  const { idToken } = await createGoogleToken({ email, name: "Google Student" });
  await signInGoogle(page, idToken, "STUDENT");
  await expect(page).toHaveURL(/\/student(?:\/dashboard)?$/);
  await expect(page.getByText("Student dashboard")).toBeVisible();
});

test("new Google Recruiter lands on the recruiter dashboard", async ({ page }) => {
  const email = uniqueEmail("google-recruiter");
  const { idToken } = await createGoogleToken({ email, name: "Google Recruiter" });
  await signInGoogle(page, idToken, "RECRUITER");
  await expect(page).toHaveURL(/\/recruiter$/);
  await expect(page.getByText("Hiring overview")).toBeVisible();
});

test("verified existing email account links through Google sign-in", async ({ page }) => {
  const existing = await createDatabaseUser({ verified: true });
  const { idToken } = await createGoogleToken({ email: existing.email, name: "Linked User" });
  await signInGoogle(page, idToken);
  await expect(page).toHaveURL(/\/student(?:\/dashboard)?$/);
  const me = await apiFromPage(page, "/auth/me");
  expect(me.status).toBe(200);
  expect(me.body.data.email).toBe(existing.email);
});

test("unverified existing email account is blocked from Google sign-in", async ({ page }) => {
  const existing = await createDatabaseUser({ verified: false });
  const { idToken } = await createGoogleToken({ email: existing.email, name: "Unverified User" });
  await page.goto("/");
  const result = await apiFromPage(page, "/auth/firebase/google", {
    method: "POST",
    body: JSON.stringify({
      idToken,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
      role: "STUDENT",
    }),
  });
  expect(result.status).toBe(409);
  expect(result.body.error.code).toBe("ACCOUNT_LINK_REQUIRES_VERIFIED_EMAIL");
});

test("role routing prevents cross-portal access", async ({ page }) => {
  const student = await createDatabaseUser({ role: "STUDENT" });
  await signInPassword(page, student);
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/recruiter");
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole("button", { name: "Sign out" }).click();

  const recruiter = await createDatabaseUser({ role: "RECRUITER" });
  await signInPassword(page, recruiter);
  await expect(page).toHaveURL(/\/recruiter$/);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/recruiter$/);
});

test("session cookies and auth/me are issued only while signed in", async ({ page, context }) => {
  const user = await createDatabaseUser();
  await signInPassword(page, user);
  const cookies = await context.cookies();
  const access = cookies.find((cookie) => cookie.name === "career_access");
  const refresh = cookies.find((cookie) => cookie.name === "career_refresh");
  const csrf = cookies.find((cookie) => cookie.name === "career_csrf");
  expect(access?.httpOnly).toBe(true);
  expect(refresh?.httpOnly).toBe(true);
  expect(csrf).toBeTruthy();
  expect((await apiFromPage(page, "/auth/me")).status).toBe(200);
  await page.getByRole("button", { name: "Sign out" }).click();
  expect((await apiFromPage(page, "/auth/me")).status).toBe(401);
  const afterLogout = await context.cookies();
  expect(afterLogout.some((cookie) => ["career_access", "career_refresh"].includes(cookie.name))).toBe(false);
});

test("logout clears the Firebase emulator session", async ({ page, context }) => {
  const email = uniqueEmail("google-logout");
  const { idToken } = await createGoogleToken({ email, name: "Logout User" });
  await signInGoogle(page, idToken);
  await expect(page).toHaveURL(/\/student(?:\/dashboard)?$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((cookie) => cookie.name === "career_access")).toBe(false);
});

test("CSRF rejects a state-changing request without the matching header", async ({ page }) => {
  const user = await createDatabaseUser();
  await signInPassword(page, user);
  const response = await apiFromPage(page, "/auth/logout", { method: "POST" });
  expect(response.status).toBe(403);
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("career_csrf=")).split("=")[1]));
  const accepted = await apiFromPage(page, "/auth/logout", {
    method: "POST",
    headers: { "x-csrf-token": csrf },
  });
  expect(accepted.status).toBe(204);
});

test("five wrong passwords use one response and temporarily lock the account", async ({ page }) => {
  const user = await createDatabaseUser();
  await page.goto("/login");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("Wrong-Passphrase-2038!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  await page.getByLabel("Email").fill(uniqueEmail("unknown"));
  await page.getByLabel("Password").fill("Wrong-Passphrase-2038!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

for (const [label, code, message] of [
  ["popup closed by the user", "auth/popup-closed-by-user", "closed before completion"],
  ["popup blocked", "auth/popup-blocked", "browser blocked"],
  ["network errors", "auth/network-request-failed", "could not connect"],
]) {
  test(`Google UI reports ${label}`, async ({ page }) => {
    await page.addInitScript(({ errorCode }) => {
      window.__E2E_FIREBASE_ERROR__ = errorCode;
    }, { errorCode: code });
    await page.goto("/login");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByText(new RegExp(message, "i"))).toBeVisible();
  });
}
