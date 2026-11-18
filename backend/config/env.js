"use strict";

const { z } = require("zod");

const optionalValue = (schema) => z.preprocess((value) => value === "" ? undefined : value, schema.optional());
const accessTokenTtl = z.string()
  .regex(/^[1-9]\d*m$/, "must be a positive number of minutes")
  .refine((value) => Number.parseInt(value, 10) <= 15, "must not exceed 15 minutes")
  .default("15m");
const refreshTokenTtl = z.string()
  .regex(/^[1-9]\d*d$/, "must be a positive number of days")
  .refine((value) => Number.parseInt(value, 10) <= 30, "must not exceed 30 days")
  .default("30d");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: optionalValue(z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), "must use PostgreSQL")),
  REDIS_URL: optionalValue(z.string().url().refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), "must use Redis")),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  BACKEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  ACCESS_TOKEN_SECRET: optionalValue(z.string().min(1)),
  SESSION_TOKEN_PEPPER: optionalValue(z.string().min(1)),
  ACCESS_TOKEN_TTL: accessTokenTtl,
  REFRESH_TOKEN_TTL: refreshTokenTtl,
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: optionalValue(z.string().regex(/^\.?[a-z0-9.-]+$/i)),
  EMAIL_PROVIDER: optionalValue(z.string().trim().min(1).max(64)),
  EMAIL_API_URL: optionalValue(z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "must use HTTP or HTTPS")),
  EMAIL_API_KEY: optionalValue(z.string().min(1).max(4096)),
  LLM_PROVIDER: z.enum(["gemini", "openai-compatible", "none"]).optional(),
  GEMINI_API_KEY: optionalValue(z.string().min(1).max(4096)),
  GEMINI_MODEL: z.string().trim().min(1).max(200).default("gemini-3.8-flash"),
  GEMINI_FALLBACK_MODEL: optionalValue(z.string().trim().min(1).max(200)),
  LLM_API_URL: optionalValue(z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "must use HTTP or HTTPS")),
  LLM_API_KEY: optionalValue(z.string().min(1).max(4096)),
  LLM_MODEL: optionalValue(z.string().trim().min(1).max(200)),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  GOOGLE_OAUTH_CLIENT_ID: optionalValue(z.string().trim().min(1).max(512)),
  GOOGLE_OAUTH_CLIENT_SECRET: optionalValue(z.string().min(1).max(1024)),
  GOOGLE_OAUTH_CALLBACK_URL: optionalValue(z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "must use HTTP or HTTPS")),
  FIREBASE_PROJECT_ID: optionalValue(z.string().trim().min(1).max(128)),
  FIREBASE_AUTH_EMULATOR: z.enum(["true", "false"]).default("false"),
  FIREBASE_AUTH_EMULATOR_HOST: optionalValue(z.string().regex(/^[a-z0-9.-]+:\d+$/i)),
  PLATFORM_TERMS_VERSION: z.string().trim().min(1).max(64).default("1.0"),
  PRIVACY_POLICY_VERSION: z.string().trim().min(1).max(64).default("1.0"),
});

function validateEnv(environment = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (result.data.NODE_ENV !== "test" && !result.data.ACCESS_TOKEN_SECRET) {
    throw new Error("Invalid environment configuration: ACCESS_TOKEN_SECRET: required outside test.");
  }
  if (result.data.NODE_ENV !== "test" && !result.data.SESSION_TOKEN_PEPPER) {
    throw new Error("Invalid environment configuration: SESSION_TOKEN_PEPPER: required outside test.");
  }
  if (result.data.NODE_ENV === "production"
    && (result.data.ACCESS_TOKEN_SECRET.length < 32 || result.data.ACCESS_TOKEN_SECRET.startsWith("replace-with-"))) {
    throw new Error("Invalid environment configuration: ACCESS_TOKEN_SECRET must be a non-placeholder value of at least 32 characters in production.");
  }
  if (result.data.NODE_ENV === "production"
    && (result.data.SESSION_TOKEN_PEPPER.length < 32 || result.data.SESSION_TOKEN_PEPPER.startsWith("replace-with-"))) {
    throw new Error("Invalid environment configuration: SESSION_TOKEN_PEPPER must be a non-placeholder value of at least 32 characters in production.");
  }
  if (result.data.COOKIE_SAME_SITE === "none" && result.data.NODE_ENV !== "production") {
    throw new Error("Invalid environment configuration: COOKIE_SAME_SITE=none requires production Secure cookies.");
  }
  if (result.data.NODE_ENV === "production" && result.data.FIREBASE_AUTH_EMULATOR === "true") {
    throw new Error("Invalid environment configuration: Firebase Auth Emulator is forbidden in production.");
  }
  if (result.data.FIREBASE_AUTH_EMULATOR === "true" && !result.data.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Invalid environment configuration: FIREBASE_AUTH_EMULATOR_HOST is required when the emulator is enabled.");
  }
  if (result.data.NODE_ENV === "production"
    && (!result.data.FRONTEND_ORIGIN.startsWith("https://") || !result.data.BACKEND_ORIGIN.startsWith("https://"))) {
    throw new Error("Invalid environment configuration: production frontend and backend origins must use HTTPS.");
  }
  if (Boolean(result.data.EMAIL_API_URL) !== Boolean(result.data.EMAIL_API_KEY)) {
    throw new Error("Invalid environment configuration: EMAIL_API_URL and EMAIL_API_KEY must be configured together.");
  }
  if (result.data.EMAIL_PROVIDER && !result.data.EMAIL_API_URL) {
    throw new Error("Invalid environment configuration: EMAIL_PROVIDER requires EMAIL_API_URL and EMAIL_API_KEY.");
  }
  if (result.data.LLM_PROVIDER === "openai-compatible" && (!result.data.LLM_API_URL || !result.data.LLM_API_KEY)) {
    throw new Error("Invalid environment configuration: openai-compatible requires LLM_API_URL and LLM_API_KEY.");
  }
  const googleOAuthConfigured = [
    result.data.GOOGLE_OAUTH_CLIENT_ID,
    result.data.GOOGLE_OAUTH_CLIENT_SECRET,
    result.data.GOOGLE_OAUTH_CALLBACK_URL,
  ].filter(Boolean).length;
  if (googleOAuthConfigured !== 0 && googleOAuthConfigured !== 3) {
    throw new Error("Invalid environment configuration: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_CALLBACK_URL must be configured together.");
  }
  if (googleOAuthConfigured === 3) {
    const callback = new URL(result.data.GOOGLE_OAUTH_CALLBACK_URL);
    if (callback.origin !== new URL(result.data.BACKEND_ORIGIN).origin
      || callback.pathname !== "/api/v1/auth/google/callback" || callback.search || callback.hash) {
      throw new Error("Invalid environment configuration: GOOGLE_OAUTH_CALLBACK_URL must be the exact backend /api/v1/auth/google/callback URL.");
    }
  }
  return result.data;
}

module.exports = { validateEnv };
