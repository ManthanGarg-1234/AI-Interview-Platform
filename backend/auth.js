"use strict";

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { hashPassword, verifyPassword } = require("./services/password");
const { validateEnv } = require("./config/env");
const { sendEmail, getEmailProviderConfig } = require("./email");
const googleOAuth = require("./google-oauth");
const firebaseAuth = require("./firebase-auth");

const accessCookie = "career_access";
const refreshCookie = "career_refresh";
const csrfCookie = "career_csrf";
const googleOAuthCookie = "career_google_oauth";
const issuer = "careerprepai";
const audience = "careerprepai-web";
const ACCESS_COOKIE_PATH = "/api/v1";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const passwordCategories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MAX_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const passwordSchema = z.string()
  .min(12)
  .max(128)
  .refine((value) => passwordCategories.filter((pattern) => pattern.test(value)).length >= 3, "Password must use at least three character types.");

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(320),
  password: passwordSchema,
  confirmPassword: z.string().min(1).max(128),
  acceptedTerms: z.literal(true),
  acceptedPrivacyPolicy: z.literal(true),
  role: z.enum(["STUDENT", "RECRUITER"]).optional(),
}).superRefine((input, context) => {
  if (!input.fullName && !input.name) {
    context.addIssue({ code: "custom", path: ["fullName"], message: "Full name is required." });
  }
  if (input.password !== input.confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});
const recoveryEmailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });
const opaqueTokenSchema = z.object({ token: z.string().min(32).max(128) });
const passwordResetSchema = opaqueTokenSchema.extend({
  password: passwordSchema,
  confirmPassword: z.string().min(1).max(128),
}).superRefine((input, context) => {
  if (input.password !== input.confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: passwordSchema,
  confirmPassword: z.string().min(1).max(128),
}).superRefine((input, context) => {
  if (input.password !== input.confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
  if (input.password === input.currentPassword) {
    context.addIssue({ code: "custom", path: ["password"], message: "Choose a password different from your current password." });
  }
});
const googleOAuthStartSchema = z.object({
  acceptedTerms: z.boolean().default(false),
  acceptedPrivacyPolicy: z.boolean().default(false),
}).refine((input) => input.acceptedTerms === input.acceptedPrivacyPolicy, {
  message: "Terms and privacy consent must be accepted together.",
});
const firebaseGoogleSchema = z.object({
  idToken: z.string().min(20).max(4096),
  acceptedTerms: z.boolean().default(false),
  acceptedPrivacyPolicy: z.boolean().default(false),
  role: z.enum(["STUDENT", "RECRUITER"]).default("STUDENT"),
});

function authConfig() {
  return validateEnv();
}

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function tokenHash(token) {
  return crypto.createHmac("sha256", authConfig().SESSION_TOKEN_PEPPER).update(token).digest("hex");
}

function metadataHash(value) {
  return value ? tokenHash(value) : null;
}

function legacyTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createOpaqueToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function durationMilliseconds(value) {
  const match = value.match(/^(\d+)(m|d)$/);
  if (!match) throw new Error("Validated authentication token duration is invalid.");
  return Number(match[1]) * (match[2] === "m" ? 60_000 : 86_400_000);
}

function issueAccess(user, sessionId) {
  const config = authConfig();
  return jwt.sign(
    { sid: sessionId },
    config.ACCESS_TOKEN_SECRET,
    {
      algorithm: "HS256",
      audience,
      expiresIn: config.ACCESS_TOKEN_TTL,
      issuer,
      jwtid: crypto.randomUUID(),
      subject: user.id,
    },
  );
}

function cookieBase() {
  const config = authConfig();
  return {
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
    sameSite: config.COOKIE_SAME_SITE,
    secure: config.NODE_ENV === "production",
  };
}

function ensureCsrf(res, token = createOpaqueToken()) {
  res.cookie(csrfCookie, token, {
    ...cookieBase(),
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
}

function setAuthCookies(res, user, sessionId, refreshToken, csrfToken) {
  const config = authConfig();
  const base = cookieBase();
  res.cookie(accessCookie, issueAccess(user, sessionId), {
    ...base,
    httpOnly: true,
    maxAge: durationMilliseconds(config.ACCESS_TOKEN_TTL),
    path: ACCESS_COOKIE_PATH,
  });
  res.cookie(refreshCookie, refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: durationMilliseconds(config.REFRESH_TOKEN_TTL),
    path: REFRESH_COOKIE_PATH,
  });
  ensureCsrf(res, csrfToken);
}

function clearAuthCookies(res) {
  const base = cookieBase();
  res.clearCookie(accessCookie, { ...base, path: ACCESS_COOKIE_PATH });
  res.clearCookie(refreshCookie, { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie(csrfCookie, { ...base, httpOnly: false, path: "/" });
}

function clearGoogleOAuthCookie(res) {
  res.clearCookie(googleOAuthCookie, { ...cookieBase(), path: "/api/v1/auth/google/callback" });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.fullName || (user.studentProfile
      ? `${user.studentProfile.firstName} ${user.studentProfile.lastName}`.trim()
      : user.recruiterProfile?.jobTitle || user.email),
  };
}

function auditData(req, action, actorUserId, resourceType, resourceId, after) {
  return {
    actorUserId: actorUserId || null,
    action,
    resourceType,
    resourceId: resourceId || null,
    after: after || undefined,
    requestId: req.requestId || crypto.randomUUID(),
    ipAddress: metadataHash(req.ip?.slice(0, 64)),
  };
}

async function writeAudit(tx, req, action, actorUserId, resourceType, resourceId, after) {
  await tx.auditLog.create({ data: auditData(req, action, actorUserId, resourceType, resourceId, after) });
}

async function withSerializableTransaction(prisma, operation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable", timeout: 10_000 });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw httpError(503, "AUTH_TRANSACTION_CONFLICT", "Authentication is temporarily unavailable.");
}

async function createSession(prisma, user, req, upgradedPasswordHash = null, loginMethod = null) {
  const config = authConfig();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMilliseconds(config.REFRESH_TOKEN_TTL));
  const sessionId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const refreshToken = createOpaqueToken();
  const sessionSecret = createOpaqueToken();

  const { sessionUser, newDevice } = await withSerializableTransaction(prisma, async (tx) => {
    const previousSessions = await tx.userSession.findMany({
      where: { userId: user.id },
      select: { ipAddress: true, userAgent: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    const currentIp = metadataHash(req.ip?.slice(0, 64));
    const currentUserAgent = metadataHash(req.get("user-agent")?.slice(0, 512));
    const newDevice = previousSessions.length > 0
      && !previousSessions.some((session) => session.ipAddress === currentIp && session.userAgent === currentUserAgent);
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        ...(upgradedPasswordHash ? { passwordHash: upgradedPasswordHash } : {}),
      },
      include: { studentProfile: true, recruiterProfile: true },
    });
    await tx.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        sessionTokenHash: tokenHash(sessionSecret),
        ipAddress: currentIp,
        userAgent: currentUserAgent,
        expiresAt,
        lastActivityAt: now,
      },
    });
    await tx.tokenFamily.create({
      data: { id: familyId, userId: user.id, sessionId, expiresAt },
    });
    await tx.refreshToken.create({
      data: { userId: user.id, tokenHash: tokenHash(refreshToken), familyId, expiresAt },
    });
    await writeAudit(tx, req, "AUTH_LOGIN_SUCCESS", user.id, "USER", user.id, { role: user.role });
    if (loginMethod === "GOOGLE") {
      await writeAudit(tx, req, "AUTH_OAUTH_LOGIN", user.id, "USER", user.id, { provider: "GOOGLE", role: user.role });
    }
    if (newDevice) {
      await tx.securityEvent.create({
        data: {
          userId: user.id,
          type: "NEW_LOGIN_DEVICE",
          severity: "HIGH",
          source: "AUTHENTICATION",
          details: { loginMethod: loginMethod || "PASSWORD", sessionId },
          status: "OPEN",
        },
      });
      await writeAudit(tx, req, "AUTH_NEW_DEVICE_LOGIN", user.id, "USER", user.id, {
        loginMethod: loginMethod || "PASSWORD",
      });
    }
    return { sessionUser: updatedUser, newDevice };
  });

  if (newDevice) {
    try {
      await sendEmail({
        to: user.email,
        subject: "New CareerPrepAI sign-in detected",
        text: "A sign-in to your CareerPrepAI account was detected from a new device or location. If this was not you, sign in, review your active sessions, and revoke any session you do not recognize.",
      });
    } catch (error) {
      await prisma.auditLog.create({
        data: auditData(req, "AUTH_SECURITY_ALERT_EMAIL_FAILED", user.id, "USER", user.id, {
          providerErrorCode: error.code || "EMAIL_PROVIDER_FAILED",
        }),
      });
    }
  }

  return { user: sessionUser, sessionId, refreshToken };
}

async function register(req, res, forcedRole = null) {
  const input = registrationSchema.parse(req.body);
  if (forcedRole && input.role && input.role !== forcedRole) {
    throw httpError(400, "INVALID_ROLE", "Registration role does not match the selected registration route.");
  }
  const role = forcedRole || input.role || "STUDENT";
  const normalizedEmail = normalizeEmail(input.email);
  const fullName = (input.fullName || input.name).trim();
  const config = authConfig();
  getEmailProviderConfig();
  const prisma = getPrisma();
  if (await prisma.user.findUnique({ where: { emailNormalized: normalizedEmail }, select: { id: true } })) {
    throw httpError(409, "REGISTRATION_UNAVAILABLE", "Unable to register with those details.");
  }

  const passwordHash = await hashPassword(input.password);
  const rawToken = createOpaqueToken();
  const [firstName, ...lastParts] = fullName.split(/\s+/);
  const now = new Date();
  try {
    const user = await withSerializableTransaction(prisma, async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          emailNormalized: normalizedEmail,
          fullName,
          passwordHash,
          role,
          status: "PENDING",
          emailVerifiedAt: null,
          studentProfile: role === "STUDENT"
            ? { create: { firstName, lastName: lastParts.join(" ") || firstName } }
            : undefined,
          recruiterProfile: role === "RECRUITER" ? { create: {} } : undefined,
          consents: {
            create: [
              {
                type: "PLATFORM_TERMS",
                status: "GRANTED",
                scope: { accepted: true },
                policyVersion: config.PLATFORM_TERMS_VERSION,
                grantedAt: now,
                source: "REGISTRATION",
              },
              {
                type: "PRIVACY_POLICY",
                status: "GRANTED",
                scope: { accepted: true },
                policyVersion: config.PRIVACY_POLICY_VERSION,
                grantedAt: now,
                source: "REGISTRATION",
              },
            ],
          },
        },
        include: { studentProfile: true, recruiterProfile: true },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          tokenHash: tokenHash(rawToken),
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await writeAudit(tx, req, "AUTH_REGISTERED", created.id, "USER", created.id, { role, status: created.status });
      return created;
    });
    try {
      await sendVerificationEmail(user, rawToken, config);
    } catch (error) {
      await prisma.emailVerificationToken.updateMany({
        where: { tokenHash: tokenHash(rawToken), usedAt: null },
        data: { usedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: auditData(req, "AUTH_EMAIL_DELIVERY_FAILED", user.id, "USER", user.id, {
          flow: "REGISTRATION",
          providerErrorCode: error.code || "EMAIL_PROVIDER_FAILED",
        }),
      });
      throw error;
    }
    return res.status(201).json({
      data: { ...publicUser(user), status: user.status },
      message: "Account created. Check your email for a verification link before signing in.",
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw httpError(409, "REGISTRATION_UNAVAILABLE", "Unable to register with those details.");
    }
    throw error;
  }
}

function emailActionLink(pathname, rawToken, config) {
  const link = new URL(pathname, config.FRONTEND_ORIGIN);
  link.hash = new URLSearchParams({ token: rawToken }).toString();
  return link.toString();
}

async function sendVerificationEmail(user, rawToken, config = authConfig()) {
  const link = emailActionLink("/verify-email", rawToken, config);
  await sendEmail({
    to: user.email,
    subject: "Verify your CareerPrepAI email",
    text: `Use this one-time link to verify your email address: ${link}\n\nThe link expires in 24 hours. If you did not create this account, you can ignore this message.`,
  });
}

async function sendPasswordResetEmail(user, rawToken, config = authConfig()) {
  const link = emailActionLink("/reset-password", rawToken, config);
  await sendEmail({
    to: user.email,
    subject: "Reset your CareerPrepAI password",
    text: `Use this one-time link to reset your password: ${link}\n\nThe link expires in 30 minutes. If you did not request a reset, you can ignore this message.`,
  });
}

function googleOAuthConfig() {
  const config = authConfig();
  if (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET || !config.GOOGLE_OAUTH_CALLBACK_URL) {
    throw httpError(503, "GOOGLE_OAUTH_NOT_CONFIGURED", "Google sign-in is not configured.");
  }
  return config;
}

function googleOAuthStateKey() {
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    Buffer.from(authConfig().SESSION_TOKEN_PEPPER),
    Buffer.from("careerprepai"),
    Buffer.from("google-oauth-state-v1"),
    32,
  ));
}

function encryptGoogleOAuthTransaction(transaction) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", googleOAuthStateKey(), iv);
  cipher.setAAD(Buffer.from("careerprepai:google-oauth-state:v1"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(transaction), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptGoogleOAuthTransaction(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  const [encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra.length) return null;
  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 1024) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", googleOAuthStateKey(), iv);
    decipher.setAAD(Buffer.from("careerprepai:google-oauth-state:v1"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = z.object({
      state: z.string().min(32).max(128),
      nonce: z.string().min(32).max(128),
      codeVerifier: z.string().min(43).max(128),
      acceptedTerms: z.boolean(),
      acceptedPrivacyPolicy: z.boolean(),
      expiresAt: z.number().int(),
    }).safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function startGoogleOAuth(req, res) {
  const config = googleOAuthConfig();
  const input = googleOAuthStartSchema.parse(req.body || {});
  const state = createOpaqueToken();
  const nonce = createOpaqueToken();
  const codeVerifier = createOpaqueToken();
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const client = googleOAuth.createGoogleOAuthClient(config);
  let authorizationUrl;
  try {
    authorizationUrl = client.generateAuthUrl({
      access_type: "online",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      nonce,
      redirect_uri: config.GOOGLE_OAUTH_CALLBACK_URL,
      response_type: "code",
      scope: ["openid", "email", "profile"],
      state,
    });
  } catch {
    throw httpError(503, "GOOGLE_OAUTH_UNAVAILABLE", "Google sign-in is temporarily unavailable.");
  }
  const transaction = encryptGoogleOAuthTransaction({
    state,
    nonce,
    codeVerifier,
    acceptedTerms: input.acceptedTerms,
    acceptedPrivacyPolicy: input.acceptedPrivacyPolicy,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  res.cookie(googleOAuthCookie, transaction, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    path: "/api/v1/auth/google/callback",
    sameSite: "lax",
  });
  return res.json({ data: { authorizationUrl } });
}

function redirectGoogleOAuth(res, config, path, outcome = null) {
  clearGoogleOAuthCookie(res);
  const destination = new URL(path, config.FRONTEND_ORIGIN);
  if (outcome) destination.searchParams.set("oauth", outcome);
  return res.redirect(302, destination.toString());
}

function googleHomePath(role) {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "RECRUITER") return "/recruiter/dashboard";
  return "/student/profile";
}

async function completeGoogleOAuth(req, res) {
  const config = googleOAuthConfig();
  const transaction = decryptGoogleOAuthTransaction(req.cookies?.[googleOAuthCookie]);
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (req.query.error || !transaction || transaction.expiresAt <= Date.now()
    || !safeEqual(transaction.state, state) || !code) {
    return redirectGoogleOAuth(res, config, "/login", "failed");
  }

  let claims;
  try {
    const client = googleOAuth.createGoogleOAuthClient(config);
    const { tokens } = await client.getToken({ code, codeVerifier: transaction.codeVerifier });
    if (!tokens?.id_token) throw new Error("Missing identity token.");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_OAUTH_CLIENT_ID,
    });
    claims = ticket.getPayload();
  } catch {
    return redirectGoogleOAuth(res, config, "/login", "failed");
  }

  if (!claims || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
    || !safeEqual(claims.nonce, transaction.nonce) || claims.email_verified !== true
    || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255
    || typeof claims.email !== "string" || !z.string().email().safeParse(claims.email).success) {
    return redirectGoogleOAuth(res, config, "/login", "failed");
  }

  const prisma = getPrisma();
  const normalizedEmail = normalizeEmail(claims.email);
  let account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
    include: { user: { include: { studentProfile: true, recruiterProfile: true } } },
  });
  let user = account?.user;
  if (!user) {
    const existing = await prisma.user.findUnique({
      where: { emailNormalized: normalizedEmail },
      select: { id: true },
    });
    if (existing) return redirectGoogleOAuth(res, config, "/login", "link-required");
    if (!transaction.acceptedTerms || !transaction.acceptedPrivacyPolicy) {
      return redirectGoogleOAuth(res, config, "/register", "consent-required");
    }

    const claimedName = typeof claims.name === "string" ? claims.name.trim().slice(0, 200) : "";
    const fullName = claimedName || claims.email.split("@")[0].slice(0, 200);
    const [firstName, ...lastParts] = fullName.split(/\s+/);
    let profileImageUrl;
    if (typeof claims.picture === "string" && claims.picture.length <= 500) {
      try {
        if (new URL(claims.picture).protocol === "https:") profileImageUrl = claims.picture;
      } catch {
        profileImageUrl = undefined;
      }
    }
    const now = new Date();
    try {
      user = await withSerializableTransaction(prisma, async (tx) => {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            emailNormalized: normalizedEmail,
            fullName,
            profileImageUrl,
            passwordHash: null,
            role: "STUDENT",
            status: "ACTIVE",
            emailVerifiedAt: now,
            studentProfile: {
              create: {
                firstName: firstName.slice(0, 100),
                lastName: (lastParts.join(" ") || firstName).slice(0, 100),
              },
            },
            oauthAccounts: {
              create: {
                provider: "GOOGLE",
                providerAccountId: claims.sub,
                providerEmail: normalizedEmail,
                providerEmailVerified: true,
              },
            },
            consents: {
              create: [
                {
                  type: "PLATFORM_TERMS",
                  status: "GRANTED",
                  scope: { accepted: true },
                  policyVersion: config.PLATFORM_TERMS_VERSION,
                  grantedAt: now,
                  source: "GOOGLE_REGISTRATION",
                },
                {
                  type: "PRIVACY_POLICY",
                  status: "GRANTED",
                  scope: { accepted: true },
                  policyVersion: config.PRIVACY_POLICY_VERSION,
                  grantedAt: now,
                  source: "GOOGLE_REGISTRATION",
                },
              ],
            },
          },
          include: { studentProfile: true, recruiterProfile: true },
        });
        await writeAudit(tx, req, "AUTH_OAUTH_REGISTERED", created.id, "USER", created.id, { provider: "GOOGLE" });
        return created;
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      account = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
        include: { user: { include: { studentProfile: true, recruiterProfile: true } } },
      });
      if (!account) return redirectGoogleOAuth(res, config, "/login", "link-required");
      user = account.user;
    }
  }

  if (user.status !== "ACTIVE" || user.deletedAt || !user.emailVerifiedAt) {
    return redirectGoogleOAuth(res, config, "/login", "unavailable");
  }
  const session = await createSession(prisma, user, req, null, "GOOGLE");
  setAuthCookies(res, session.user, session.sessionId, session.refreshToken);
  return redirectGoogleOAuth(res, config, googleHomePath(user.role));
}

async function firebaseGoogleAuth(req, res) {
  const input = firebaseGoogleSchema.parse(req.body || {});
  const config = authConfig();
  if (!config.FIREBASE_PROJECT_ID) {
    throw httpError(503, "FIREBASE_AUTH_NOT_CONFIGURED", "Firebase Google sign-in is not configured.");
  }
  const claims = await firebaseAuth.verifyFirebaseGoogleToken(input.idToken, config.FIREBASE_PROJECT_ID);
  const prisma = getPrisma();
  const normalizedEmail = normalizeEmail(claims.email);
  let account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
    include: { user: { include: { studentProfile: true, recruiterProfile: true } } },
  });
  let user = account?.user;

  if (!user) {
    const existing = await prisma.user.findUnique({
      where: { emailNormalized: normalizedEmail },
      include: { studentProfile: true, recruiterProfile: true },
    });
    if (existing) {
      if (!existing.emailVerifiedAt) {
        throw httpError(409, "ACCOUNT_LINK_REQUIRES_VERIFIED_EMAIL", "Verify the existing account email before linking Google sign-in.");
      }
      try {
        user = await withSerializableTransaction(prisma, async (tx) => {
          await tx.oAuthAccount.upsert({
            where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
            update: { providerEmail: normalizedEmail, providerEmailVerified: true },
            create: { userId: existing.id, provider: "GOOGLE", providerAccountId: claims.sub, providerEmail: normalizedEmail, providerEmailVerified: true },
          });
          await writeAudit(tx, req, "AUTH_FIREBASE_GOOGLE_LINKED", existing.id, "USER", existing.id, { provider: "GOOGLE" });
          return existing;
        });
      } catch (error) {
        if (error.code !== "P2002") throw error;
        account = await prisma.oAuthAccount.findUnique({
          where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
          include: { user: { include: { studentProfile: true, recruiterProfile: true } } },
        });
        if (!account) throw httpError(409, "REGISTRATION_UNAVAILABLE", "Unable to link the Google account.");
        user = account.user;
      }
    } else if (!input.acceptedTerms || !input.acceptedPrivacyPolicy) {
      throw httpError(400, "CONSENT_REQUIRED", "Accept both the Terms of Service and Privacy Policy before creating an account.");
    } else {
    const fullName = typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim().slice(0, 200)
      : normalizedEmail.split("@")[0].slice(0, 200);
    const [firstName, ...lastParts] = fullName.split(/\s+/);
    const now = new Date();
    let profileImageUrl;
    if (typeof claims.picture === "string" && claims.picture.length <= 500) {
      try {
        if (new URL(claims.picture).protocol === "https:") profileImageUrl = claims.picture;
      } catch {
        profileImageUrl = undefined;
      }
    }

    try {
      user = await withSerializableTransaction(prisma, async (tx) => {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            emailNormalized: normalizedEmail,
            fullName,
            profileImageUrl,
            passwordHash: null,
            role: input.role,
            status: "ACTIVE",
            emailVerifiedAt: now,
            studentProfile: input.role === "STUDENT"
              ? {
                  create: {
                    firstName: firstName.slice(0, 100),
                    lastName: (lastParts.join(" ") || firstName).slice(0, 100),
                  },
                }
              : undefined,
            recruiterProfile: input.role === "RECRUITER" ? { create: {} } : undefined,
            oauthAccounts: {
              create: {
                provider: "GOOGLE",
                providerAccountId: claims.sub,
                providerEmail: normalizedEmail,
                providerEmailVerified: true,
              },
            },
            consents: {
              create: [
                {
                  type: "PLATFORM_TERMS",
                  status: "GRANTED",
                  scope: { accepted: true },
                  policyVersion: config.PLATFORM_TERMS_VERSION,
                  grantedAt: now,
                  source: "FIREBASE_GOOGLE_REGISTRATION",
                },
                {
                  type: "PRIVACY_POLICY",
                  status: "GRANTED",
                  scope: { accepted: true },
                  policyVersion: config.PRIVACY_POLICY_VERSION,
                  grantedAt: now,
                  source: "FIREBASE_GOOGLE_REGISTRATION",
                },
              ],
            },
          },
          include: { studentProfile: true, recruiterProfile: true },
        });
        await writeAudit(tx, req, "AUTH_FIREBASE_GOOGLE_REGISTERED", created.id, "USER", created.id, {
          provider: "FIREBASE_GOOGLE",
          role: input.role,
        });
        return created;
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      account = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: claims.sub } },
        include: { user: { include: { studentProfile: true, recruiterProfile: true } } },
      });
      if (!account) throw httpError(409, "REGISTRATION_UNAVAILABLE", "Unable to create the account with those details.");
      user = account.user;
    }
    }
  }

  if (user.status !== "ACTIVE" || user.role === "SYSTEM" || user.deletedAt || !user.emailVerifiedAt) {
    throw httpError(403, "ACCOUNT_UNAVAILABLE", "This account cannot sign in.");
  }
  const session = await createSession(prisma, user, req, null, "GOOGLE");
  setAuthCookies(res, session.user, session.sessionId, session.refreshToken);
  return res.json({ data: publicUser(session.user) });
}

async function issueEmailVerificationToken(prisma, userId) {
  const rawToken = createOpaqueToken();
  const now = new Date();
  await withSerializableTransaction(prisma, async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: tokenHash(rawToken),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });
  });
  return rawToken;
}

async function resendVerification(req, res) {
  const input = recoveryEmailSchema.parse(req.body);
  getEmailProviderConfig();
  const config = authConfig();
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { emailNormalized: normalizeEmail(input.email) },
    select: { id: true, email: true, status: true, emailVerifiedAt: true, deletedAt: true },
  });
  if (!user || user.status !== "PENDING" || user.emailVerifiedAt || user.deletedAt) {
    return res.status(202).json({ message: "If an account needs verification, a message will be sent if email delivery is available." });
  }

  const rawToken = await issueEmailVerificationToken(prisma, user.id);
  try {
    await sendVerificationEmail(user, rawToken, config);
  } catch (error) {
    await prisma.emailVerificationToken.updateMany({
      where: { tokenHash: tokenHash(rawToken), usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: auditData(req, "AUTH_EMAIL_DELIVERY_FAILED", user.id, "USER", user.id, {
        flow: "EMAIL_VERIFICATION",
        providerErrorCode: error.code || "EMAIL_PROVIDER_FAILED",
      }),
    });
  }
  return res.status(202).json({ message: "If an account needs verification, a message will be sent if email delivery is available." });
}

async function verifyEmail(req, res) {
  const { token } = opaqueTokenSchema.parse(req.body);
  const prisma = getPrisma();
  const verified = await withSerializableTransaction(prisma, async (tx) => {
    const now = new Date();
    const record = await tx.emailVerificationToken.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: { select: { id: true, status: true, emailVerifiedAt: true, deletedAt: true } } },
    });
    if (!record || record.usedAt || record.expiresAt <= now
      || record.user.status !== "PENDING" || record.user.emailVerifiedAt || record.user.deletedAt) {
      return null;
    }
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;
    const changed = await tx.user.updateMany({
      where: { id: record.userId, status: "PENDING", emailVerifiedAt: null, deletedAt: null },
      data: { status: "ACTIVE", emailVerifiedAt: now },
    });
    if (changed.count !== 1) return null;
    await tx.emailVerificationToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    await writeAudit(tx, req, "AUTH_EMAIL_VERIFIED", record.userId, "USER", record.userId, {});
    return true;
  });
  if (!verified) throw httpError(400, "INVALID_VERIFICATION_TOKEN", "Verification link is invalid or expired.");
  return res.json({ data: { verified: true }, message: "Email verified. You can now sign in." });
}

async function requestPasswordReset(req, res) {
  const input = recoveryEmailSchema.parse(req.body);
  getEmailProviderConfig();
  const config = authConfig();
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { emailNormalized: normalizeEmail(input.email) },
    select: { id: true, email: true, status: true, emailVerifiedAt: true, deletedAt: true, passwordHash: true },
  });
  const genericResponse = { message: "If an eligible account exists, reset instructions will be sent if email delivery is available." };
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt || user.deletedAt || !user.passwordHash) {
    return res.status(202).json(genericResponse);
  }

  const rawToken = createOpaqueToken();
  const now = new Date();
  await withSerializableTransaction(prisma, async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(rawToken),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      },
    });
  });
  try {
    await sendPasswordResetEmail(user, rawToken, config);
  } catch (error) {
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: tokenHash(rawToken), usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: auditData(req, "AUTH_EMAIL_DELIVERY_FAILED", user.id, "USER", user.id, {
        flow: "PASSWORD_RESET",
        providerErrorCode: error.code || "EMAIL_PROVIDER_FAILED",
      }),
    });
  }
  return res.status(202).json(genericResponse);
}

async function revokeAllUserSessions(tx, userId, reason, now) {
  await tx.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason, lastActivityAt: now },
  });
  await tx.tokenFamily.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason },
  });
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason },
  });
}

async function resetPassword(req, res) {
  const input = passwordResetSchema.parse(req.body);
  const prisma = getPrisma();
  const resetHash = tokenHash(input.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: resetHash },
    include: { user: { select: { id: true, status: true, emailVerifiedAt: true, deletedAt: true } } },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE"
    || !record.user.emailVerifiedAt || record.user.deletedAt) {
    throw httpError(400, "INVALID_RESET_TOKEN", "Password reset link is invalid or expired.");
  }
  const passwordHash = await hashPassword(input.password);
  const changed = await withSerializableTransaction(prisma, async (tx) => {
    const now = new Date();
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    const updatedUser = await tx.user.updateMany({
      where: { id: record.userId, status: "ACTIVE", emailVerifiedAt: { not: null }, deletedAt: null },
      data: { passwordHash, failedLoginAttempts: 0, loginLockedUntil: null },
    });
    if (updatedUser.count !== 1) return false;
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    await revokeAllUserSessions(tx, record.userId, "PASSWORD_RESET", now);
    await writeAudit(tx, req, "AUTH_PASSWORD_RESET", record.userId, "USER", record.userId, {});
    return true;
  });
  if (!changed) throw httpError(400, "INVALID_RESET_TOKEN", "Password reset link is invalid or expired.");
  return res.status(204).send();
}

async function changePassword(req, res) {
  const input = passwordChangeSchema.parse(req.body);
  const prisma = getPrisma();
  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { passwordHash: true, status: true, deletedAt: true },
  });
  if (!current?.passwordHash || current.status !== "ACTIVE" || current.deletedAt
    || !(await verifyPassword(input.currentPassword, current.passwordHash)).valid) {
    await prisma.auditLog.create({
      data: auditData(req, "AUTH_PASSWORD_CHANGE_FAILURE", req.user.id, "USER", req.user.id, { result: "failure" }),
    });
    throw httpError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
  }

  const passwordHash = await hashPassword(input.password);
  const changed = await withSerializableTransaction(prisma, async (tx) => {
    const now = new Date();
    const updated = await tx.user.updateMany({
      where: { id: req.user.id, passwordHash: current.passwordHash, status: "ACTIVE", deletedAt: null },
      data: { passwordHash },
    });
    if (updated.count !== 1) return false;
    await revokeAllUserSessions(tx, req.user.id, "PASSWORD_CHANGE", now);
    await writeAudit(tx, req, "AUTH_PASSWORD_CHANGED", req.user.id, "USER", req.user.id, {});
    return true;
  });
  if (!changed) throw httpError(409, "PASSWORD_CHANGED_CONCURRENTLY", "Password changed in another request. Sign in again.");
  clearAuthCookies(res);
  return res.status(204).send();
}

let dummyPasswordHash;
async function getDummyPasswordHash() {
  dummyPasswordHash ||= hashPassword(createOpaqueToken());
  return dummyPasswordHash;
}

async function recordLoginFailure(req, user, action = "AUTH_LOGIN_FAILURE") {
  const prisma = getPrisma();
  if (!user?.id) {
    await prisma.auditLog.create({
      data: auditData(req, action, null, "AUTHENTICATION", null, { result: "failure" }),
    });
    return null;
  }
  return withSerializableTransaction(prisma, async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: user.id },
      select: { failedLoginAttempts: true, status: true, passwordHash: true },
    });
    if (!current) return null;
    const shouldLock = current.status === "ACTIVE" && Boolean(current.passwordHash);
    const failedLoginAttempts = shouldLock ? current.failedLoginAttempts + 1 : current.failedLoginAttempts;
    const lockDuration = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
      ? Math.min(
        MAX_LOGIN_LOCKOUT_MS,
        5 * 60 * 1000 * (2 ** Math.min(failedLoginAttempts - MAX_FAILED_LOGIN_ATTEMPTS, 3)),
      )
      : 0;
    const loginLockedUntil = lockDuration ? new Date(Date.now() + lockDuration) : null;
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(shouldLock ? { failedLoginAttempts, loginLockedUntil } : {}),
      },
    });
    await writeAudit(tx, req, action, user.id, "USER", user.id, {
      result: "failure",
      ...(loginLockedUntil ? { locked: true } : {}),
    });
    return loginLockedUntil;
  });
}

async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const normalizedEmail = normalizeEmail(input.email);
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { emailNormalized: normalizedEmail },
    include: { studentProfile: true, recruiterProfile: true },
  });
  if (user?.loginLockedUntil && user.loginLockedUntil > new Date()) {
    throw httpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  const hash = user?.passwordHash || await getDummyPasswordHash();
  const verification = await verifyPassword(input.password, hash);

  if (!user || !user.passwordHash || !verification.valid) {
    await recordLoginFailure(req, user);
    throw httpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  if (user.status !== "ACTIVE" || user.role === "SYSTEM" || user.deletedAt || !user.emailVerifiedAt) {
    const action = user.status === "SUSPENDED" ? "AUTH_SUSPENDED_LOGIN_ATTEMPT" : "AUTH_LOGIN_FAILURE";
    await recordLoginFailure(req, user, action);
    throw httpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const session = await createSession(prisma, user, req, verification.upgradedHash);
  setAuthCookies(res, session.user, session.sessionId, session.refreshToken);
  return res.json({ data: publicUser(session.user) });
}

async function findRefreshToken(tx, rawToken) {
  const hashed = await tx.refreshToken.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: { family: { include: { session: true, user: { include: { studentProfile: true, recruiterProfile: true } } } } },
  });
  if (hashed) return hashed;
  return tx.refreshToken.findUnique({
    where: { tokenHash: legacyTokenHash(rawToken) },
    include: { family: { include: { session: true, user: { include: { studentProfile: true, recruiterProfile: true } } } } },
  });
}

async function revokeFamilyInTransaction(tx, familyId, reason, now) {
  const family = await tx.tokenFamily.findUnique({
    where: { id: familyId },
    select: { id: true, userId: true, sessionId: true, revokedAt: true },
  });
  if (!family || family.revokedAt) return { family, changed: false };

  await tx.tokenFamily.updateMany({
    where: { id: familyId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason },
  });
  await tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason },
  });
  if (family.sessionId) {
    await tx.userSession.updateMany({
      where: { id: family.sessionId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason, lastActivityAt: now },
    });
  }
  return { family, changed: true };
}

async function revokeFamily(prisma, req, familyId, reason, action = null) {
  return withSerializableTransaction(prisma, async (tx) => {
    const result = await revokeFamilyInTransaction(tx, familyId, reason, new Date());
    if (result.family && action) {
      await writeAudit(tx, req, action, result.family.userId, "TOKEN_FAMILY", familyId, { reason });
    }
    if (result.family && action === "AUTH_TOKEN_REUSE_DETECTED") {
      await tx.securityEvent.create({
        data: {
          userId: result.family.userId,
          type: "REFRESH_TOKEN_REUSE",
          severity: "HIGH",
          source: "AUTH",
          details: { familyId, sessionId: result.family.sessionId },
          status: "OPEN",
        },
      });
    }
    return result;
  });
}

async function ensureSessionForLegacyFamily(tx, family, user, req, now) {
  if (family.session) return family.session;
  const sessionId = crypto.randomUUID();
  const session = await tx.userSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      sessionTokenHash: tokenHash(createOpaqueToken()),
      ipAddress: metadataHash(req.ip?.slice(0, 64)),
      userAgent: metadataHash(req.get("user-agent")?.slice(0, 512)),
      expiresAt: family.expiresAt,
      lastActivityAt: now,
    },
  });
  const attached = await tx.tokenFamily.updateMany({
    where: { id: family.id, sessionId: null, revokedAt: null },
    data: { sessionId },
  });
  if (attached.count !== 1) throw httpError(503, "AUTH_TRANSACTION_CONFLICT", "Authentication is temporarily unavailable.");
  return session;
}

async function rotateRefreshToken(prisma, req, rawToken) {
  return withSerializableTransaction(prisma, async (tx) => {
    const token = await findRefreshToken(tx, rawToken);
    if (!token) return { kind: "invalid" };
    const now = new Date();
    const family = token.family;
    if (family.revokedAt) return { kind: "invalid" };
    if (token.revokedAt) {
      return { kind: token.revokeReason === "ROTATED" ? "reuse" : "invalid", familyId: family.id };
    }

    const user = family.user;
    if (token.expiresAt <= now || family.expiresAt <= now
      || user.status !== "ACTIVE" || user.role === "SYSTEM" || user.deletedAt || !user.emailVerifiedAt) {
      const reason = user.status === "SUSPENDED" || user.deletedAt ? "ACCOUNT_INACTIVE" : "EXPIRED";
      await revokeFamilyInTransaction(tx, family.id, reason, now);
      await writeAudit(tx, req, "AUTH_REFRESH_REJECTED", user.id, "TOKEN_FAMILY", family.id, { reason });
      return { kind: "invalid" };
    }

    if (family.session && (family.session.revokedAt || family.session.expiresAt <= now)) {
      await revokeFamilyInTransaction(tx, family.id, "SESSION_INACTIVE", now);
      await writeAudit(tx, req, "AUTH_REFRESH_REJECTED", user.id, "TOKEN_FAMILY", family.id, { reason: "SESSION_INACTIVE" });
      return { kind: "invalid" };
    }

    const claimed = await tx.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokeReason: "ROTATED" },
    });
    if (claimed.count !== 1) return { kind: "reuse", familyId: family.id };

    const session = await ensureSessionForLegacyFamily(tx, family, user, req, now);
    const refreshToken = createOpaqueToken();
    const expiresAt = new Date(Math.min(
      now.getTime() + durationMilliseconds(authConfig().REFRESH_TOKEN_TTL),
      family.expiresAt.getTime(),
    ));
    const replacement = await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(refreshToken),
        familyId: family.id,
        expiresAt,
      },
    });
    await tx.refreshToken.update({
      where: { id: token.id },
      data: { replacedById: replacement.id },
    });
    await tx.userSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now },
    });
    await writeAudit(tx, req, "AUTH_TOKEN_REFRESHED", user.id, "TOKEN_FAMILY", family.id, {});
    return { kind: "rotated", refreshToken, user, sessionId: session.id };
  });
}

async function refresh(req, res) {
  const rawToken = req.cookies[refreshCookie];
  if (!rawToken) throw httpError(401, "INVALID_SESSION", "Refresh session is invalid.");
  const prisma = getPrisma();
  const result = await rotateRefreshToken(prisma, req, rawToken);
  if (result.kind === "reuse") {
    await revokeFamily(prisma, req, result.familyId, "TOKEN_REUSE", "AUTH_TOKEN_REUSE_DETECTED");
    throw httpError(401, "INVALID_SESSION", "Refresh session is invalid.");
  }
  if (result.kind !== "rotated") throw httpError(401, "INVALID_SESSION", "Refresh session is invalid.");

  setAuthCookies(res, result.user, result.sessionId, result.refreshToken, req.cookies[csrfCookie] || createOpaqueToken());
  return res.json({ data: publicUser(result.user) });
}

function sameOriginRequest(req) {
  const config = authConfig();
  const expected = new URL(config.FRONTEND_ORIGIN).origin;
  const supplied = req.get("origin") || req.get("referer");
  if (!supplied || supplied === "null") return false;
  try {
    return new URL(supplied).origin === expected;
  } catch {
    return false;
  }
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const csrfExemptPaths = new Set([
  "/auth/register",
  "/auth/register/student",
  "/auth/register/recruiter",
  "/auth/login",
  "/auth/resend-verification",
  "/auth/verify-email",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/google/start",
  "/auth/firebase/google",
]);

function csrfProtection(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const isAuthPath = req.path.startsWith("/auth/");
  const hasAuthCookies = Boolean(req.cookies?.[accessCookie] || req.cookies?.[refreshCookie]);
  if (!isAuthPath && !hasAuthCookies) return next();
  if (!sameOriginRequest(req)) return next(httpError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed."));
  if (csrfExemptPaths.has(req.path)) return next();
  if (!safeEqual(req.cookies?.[csrfCookie], req.get("x-csrf-token"))) {
    return next(httpError(403, "CSRF_INVALID", "CSRF validation failed."));
  }
  return next();
}

async function revokeSessionInTransaction(tx, req, session, reason, action) {
  const now = new Date();
  await tx.userSession.updateMany({
    where: { id: session.id, userId: session.userId, revokedAt: null },
    data: { revokedAt: now, revokeReason: reason, lastActivityAt: now },
  });
  if (session.tokenFamily) {
    await revokeFamilyInTransaction(tx, session.tokenFamily.id, reason, now);
  }
  await writeAudit(tx, req, action, session.userId, "SESSION", session.id, { reason });
}

async function logout(req, res) {
  const prisma = getPrisma();
  const rawToken = req.cookies[refreshCookie];
  try {
    let handled = false;
    if (rawToken) {
      const token = await findRefreshToken(prisma, rawToken);
      if (token) {
        await withSerializableTransaction(prisma, async (tx) => {
          const result = await revokeFamilyInTransaction(tx, token.familyId, "LOGOUT", new Date());
          await writeAudit(tx, req, "AUTH_LOGOUT", result.family?.userId, "TOKEN_FAMILY", token.familyId, { reason: "LOGOUT" });
        });
        handled = true;
      }
    }
    if (!handled) {
      let claims;
      try {
        claims = jwt.verify(req.cookies[accessCookie] || "", authConfig().ACCESS_TOKEN_SECRET, {
          algorithms: ["HS256"],
          audience,
          issuer,
        });
      } catch {
        claims = null;
      }
      if (claims && typeof claims === "object" && z.string().uuid().safeParse(claims.sub).success
        && z.string().uuid().safeParse(claims.sid).success) {
        await withSerializableTransaction(prisma, async (tx) => {
          const session = await tx.userSession.findFirst({
            where: { id: claims.sid, userId: claims.sub },
            include: { tokenFamily: { select: { id: true } } },
          });
          if (session) {
            await revokeSessionInTransaction(tx, req, session, "LOGOUT", "AUTH_LOGOUT");
          } else {
            await writeAudit(tx, req, "AUTH_LOGOUT", claims.sub, "SESSION", claims.sid, { reason: "LOGOUT" });
          }
        });
      } else {
        await prisma.auditLog.create({
          data: auditData(req, "AUTH_LOGOUT", null, "SESSION", null, { reason: "LOGOUT" }),
        });
      }
    }
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
  clearAuthCookies(res);
  return res.status(204).send();
}

async function logoutAll(req, res) {
  const prisma = getPrisma();
  const now = new Date();
  await withSerializableTransaction(prisma, async (tx) => {
    await revokeAllUserSessions(tx, req.user.id, "LOGOUT_ALL", now);
    await writeAudit(tx, req, "AUTH_LOGOUT_ALL", req.user.id, "USER", req.user.id, {});
  });
  clearAuthCookies(res);
  return res.status(204).send();
}

async function listSessions(req, res) {
  const now = new Date();
  const sessions = await getPrisma().userSession.findMany({
    where: { userId: req.user.id, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastActivityAt: true, expiresAt: true },
  });
  return res.json({
    data: sessions.map((session) => ({ ...session, current: session.id === req.auth.sid })),
  });
}

async function revokeSession(req, res) {
  const sessionId = z.string().uuid().parse(req.params.sessionId);
  const prisma = getPrisma();
  await withSerializableTransaction(prisma, async (tx) => {
    const session = await tx.userSession.findFirst({
      where: { id: sessionId, userId: req.user.id },
      include: { tokenFamily: { select: { id: true } } },
    });
    if (!session) throw httpError(404, "SESSION_NOT_FOUND", "Session not found.");
    await revokeSessionInTransaction(tx, req, session, "USER_REVOKED", "AUTH_SESSION_REVOKED");
  });
  if (sessionId === req.auth.sid) clearAuthCookies(res);
  return res.status(204).send();
}

function currentCsrfToken(req, res) {
  const csrfToken = ensureCsrf(res, req.cookies[csrfCookie] || createOpaqueToken());
  return res.json({ data: { csrfToken } });
}

async function authenticate(req, _res, next) {
  const rawToken = req.cookies?.[accessCookie];
  if (!rawToken) return next(httpError(401, "UNAUTHENTICATED", "Authentication is required."));

  let claims;
  try {
    claims = jwt.verify(rawToken, authConfig().ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
      audience,
      issuer,
    });
  } catch {
    return next(httpError(401, "UNAUTHENTICATED", "Authentication session is invalid or expired."));
  }
  if (typeof claims !== "object" || !z.string().uuid().safeParse(claims.sub).success
    || !z.string().uuid().safeParse(claims.sid).success || !claims.jti) {
    return next(httpError(401, "UNAUTHENTICATED", "Authentication session is invalid or expired."));
  }

  try {
    const now = new Date();
    const session = await getPrisma().userSession.findFirst({
      where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: now } },
      include: {
        tokenFamily: true,
        user: { include: { studentProfile: true, recruiterProfile: true } },
      },
    });
    if (!session || !session.tokenFamily || session.tokenFamily.revokedAt
      || session.tokenFamily.expiresAt <= now || session.user.status !== "ACTIVE" || session.user.role === "SYSTEM"
      || session.user.deletedAt || !session.user.emailVerifiedAt) {
      return next(httpError(401, "UNAUTHENTICATED", "Authentication session is no longer active."));
    }
    if (session.lastActivityAt.getTime() < now.getTime() - 5 * 60_000) {
      await getPrisma().userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastActivityAt: now },
      });
    }
    req.user = session.user;
    req.auth = { sub: session.user.id, sid: session.id, role: session.user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, _res, next) => roles.includes(req.user?.role)
    ? next()
    : next(httpError(403, "FORBIDDEN", "You do not have permission to access this resource."));
}

module.exports = {
  register,
  resendVerification,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  changePassword,
  startGoogleOAuth,
  completeGoogleOAuth,
  firebaseGoogleAuth,
  login,
  refresh,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  currentCsrfToken,
  authenticate,
  requireRole,
  csrfProtection,
  publicUser,
  accessCookie,
  refreshCookie,
  csrfCookie,
};
