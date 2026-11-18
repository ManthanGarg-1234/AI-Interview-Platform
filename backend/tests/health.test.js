"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../index");
const { validateEnv } = require("../config/env");
const { getPrisma } = require("../prisma");
const { closeAuthRateLimitRedis } = require("../middleware/auth-rate-limit");

test("environment configuration validates required service URL protocols", () => {
  assert.deepEqual(validateEnv({ NODE_ENV: "test" }), {
    NODE_ENV: "test",
    PORT: 3000,
    FRONTEND_ORIGIN: "http://localhost:5173",
    BACKEND_ORIGIN: "http://localhost:3000",
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL: "30d",
    COOKIE_SAME_SITE: "lax",
    GEMINI_MODEL: "gemini-3.8-flash",
    LLM_TIMEOUT_MS: 20000,
    LLM_MAX_RETRIES: 1,
    FIREBASE_AUTH_EMULATOR: "false",
    PLATFORM_TERMS_VERSION: "1.0",
    PRIVACY_POLICY_VERSION: "1.0",
  });
  assert.throws(() => validateEnv({}), /ACCESS_TOKEN_SECRET/);
  assert.throws(() => validateEnv({ NODE_ENV: "development", ACCESS_TOKEN_SECRET: "configured" }), /SESSION_TOKEN_PEPPER/);
  assert.throws(() => validateEnv({
    NODE_ENV: "production",
    ACCESS_TOKEN_SECRET: "short-secret",
    SESSION_TOKEN_PEPPER: "a".repeat(32),
  }), /at least 32 characters/);
  assert.throws(() => validateEnv({
    NODE_ENV: "production",
    ACCESS_TOKEN_SECRET: "a".repeat(32),
    SESSION_TOKEN_PEPPER: "replace-with-a-long-random-secret",
  }), /non-placeholder/);
  assert.throws(() => validateEnv({
    NODE_ENV: "test",
    ACCESS_TOKEN_TTL: "16m",
  }), /15 minutes/);
  assert.throws(() => validateEnv({ DATABASE_URL: "mongodb://localhost/test" }), /DATABASE_URL/);
  assert.throws(() => validateEnv({ REDIS_URL: "http://localhost:6379" }), /REDIS_URL/);
  assert.throws(() => validateEnv({ NODE_ENV: "test", EMAIL_API_URL: "https://mail.example.test/send" }), /must be configured together/);
  assert.throws(() => validateEnv({ NODE_ENV: "test", EMAIL_PROVIDER: "example" }), /requires EMAIL_API_URL/);
  assert.throws(() => validateEnv({ NODE_ENV: "test", GOOGLE_OAUTH_CLIENT_ID: "client-id" }), /must be configured together/);
  assert.throws(() => validateEnv({
    NODE_ENV: "test",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_CALLBACK_URL: "https://api.example.test/wrong-path",
    BACKEND_ORIGIN: "https://api.example.test",
  }), /exact backend/);
  assert.doesNotThrow(() => validateEnv({
    NODE_ENV: "test",
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_CALLBACK_URL: "https://api.example.test/api/v1/auth/google/callback",
    BACKEND_ORIGIN: "https://api.example.test",
  }));
});

test("health reports dependency status without exposing connection details", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    await closeAuthRateLimitRedis();
    await getPrisma().$disconnect();
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/api/v1/health`);
  const result = await response.json();

  assert.equal(response.status, result.ok ? 200 : 503);
  assert.equal(result.service, "api");
  assert.ok(["ready", "unavailable", "not_configured"].includes(result.database));
  assert.ok(["ready", "unavailable", "not_configured"].includes(result.redis));
  assert.deepEqual(Object.keys(result).sort(), ["database", "ok", "redis", "service"]);

  const missing = await fetch(`${origin}/api/v1/not-a-route`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");

  const googleKeys = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CALLBACK_URL"];
  const savedGoogleConfig = Object.fromEntries(googleKeys.map((key) => [key, process.env[key]]));
  googleKeys.forEach((key) => { process.env[key] = ""; });
  let googleUnavailable;
  try {
    googleUnavailable = await fetch(`${origin}/api/v1/auth/google/start`, {
      method: "POST",
      headers: {
        origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ acceptedTerms: false, acceptedPrivacyPolicy: false }),
    });
  } finally {
    googleKeys.forEach((key) => {
      if (savedGoogleConfig[key] === undefined) delete process.env[key];
      else process.env[key] = savedGoogleConfig[key];
    });
  }
  assert.equal(googleUnavailable.status, 503);
  assert.equal((await googleUnavailable.json()).error.code, "GOOGLE_OAUTH_NOT_CONFIGURED");
});
