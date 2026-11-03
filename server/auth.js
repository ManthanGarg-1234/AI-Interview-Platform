"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const accessCookie = "career_access";
const refreshCookie = "career_refresh";
const csrfCookie = "career_csrf";
const accessSecret = () => process.env.ACCESS_TOKEN_SECRET || "development-only-change-me";
const refreshDays = 30;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  role: z.enum(["STUDENT", "RECRUITER"]).default("STUDENT"),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function issueAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role }, accessSecret(), { expiresIn: "15m", issuer: "careerprepai" });
}
function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}
function cookieOptions(maxAge) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", ...(maxAge ? { maxAge } : {}) };
}
function ensureCsrf(res, token = crypto.randomBytes(24).toString("base64url")) {
  res.cookie(csrfCookie, token, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return token;
}
function setAuthCookies(res, user, refreshToken) {
  res.cookie(accessCookie, issueAccess(user), cookieOptions(15 * 60 * 1000));
  res.cookie(refreshCookie, refreshToken, cookieOptions(refreshDays * 86400000));
  ensureCsrf(res);
}
function clearAuthCookies(res) {
  [accessCookie, refreshCookie, csrfCookie].forEach((name) => res.clearCookie(name, { path: "/" }));
}
function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, name: user.studentProfile ? `${user.studentProfile.firstName} ${user.studentProfile.lastName}`.trim() : user.recruiterProfile?.displayName || user.email };
}

async function createSession(prisma, user, req) {
  const raw = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + refreshDays * 86400000),
    },
  });
  return raw;
}

async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) { const error = new Error("An account with this email already exists."); error.status = 409; throw error; }
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [firstName, ...lastParts] = input.name.split(/\s+/);
  const lastName = lastParts.join(" ") || firstName;
  const active = process.env.REQUIRE_EMAIL_VERIFICATION !== "true";
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
      status: active ? "ACTIVE" : "PENDING_VERIFICATION",
      emailVerifiedAt: active ? new Date() : null,
      studentProfile: input.role === "STUDENT" ? { create: { firstName, lastName } } : undefined,
    },
    include: { studentProfile: true, recruiterProfile: true },
  });
  if (!active) {
    const error = new Error("Registration received. Verify your email before signing in.");
    error.status = 202;
    throw error;
  }
  const refresh = await createSession(prisma, user, req);
  setAuthCookies(res, user, refresh);
  res.status(201).json({ data: publicUser(user) });
}

async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { studentProfile: true, recruiterProfile: true } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) { const error = new Error("Invalid email or password."); error.status = 401; throw error; }
  if (user.status !== "ACTIVE") { const error = new Error("This account is not active."); error.status = 403; throw error; }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const refresh = await createSession(prisma, user, req);
  setAuthCookies(res, user, refresh);
  res.json({ data: publicUser(user) });
}

async function refresh(req, res) {
  const raw = req.cookies[refreshCookie];
  if (!raw) { const error = new Error("Refresh session is missing."); error.status = 401; throw error; }
  const prisma = getPrisma();
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: { include: { studentProfile: true, recruiterProfile: true } } } });
  if (!token || token.revokedAt || token.expiresAt <= new Date() || token.user.status !== "ACTIVE") { const error = new Error("Refresh session is invalid."); error.status = 401; throw error; }
  const nextRaw = createRefreshToken();
  const next = await prisma.refreshToken.create({ data: { userId: token.userId, tokenHash: hashToken(nextRaw), familyId: token.familyId, expiresAt: new Date(Date.now() + refreshDays * 86400000) } });
  await prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date(), revokeReason: "ROTATED", replacedById: next.id } });
  setAuthCookies(res, token.user, nextRaw);
  res.json({ data: publicUser(token.user) });
}

async function logout(req, res) {
  const raw = req.cookies[refreshCookie];
  if (raw && process.env.DATABASE_URL) await getPrisma().refreshToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "LOGOUT" } });
  clearAuthCookies(res);
  res.status(204).send();
}

function authenticate(req, _res, next) {
  const token = req.cookies[accessCookie];
  if (!token) return next(Object.assign(new Error("Authentication is required."), { status: 401 }));
  try { req.auth = jwt.verify(token, accessSecret(), { issuer: "careerprepai" }); next(); }
  catch { next(Object.assign(new Error("Authentication session is invalid or expired."), { status: 401 })); }
}
function requireRole(...roles) {
  return (req, _res, next) => roles.includes(req.auth?.role) ? next() : next(Object.assign(new Error("You do not have permission to access this resource."), { status: 403 }));
}
function csrfProtection(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || ["/register", "/login", "/refresh"].includes(req.path)) return next();
  if (!req.cookies[csrfCookie] || req.get("x-csrf-token") !== req.cookies[csrfCookie]) return next(Object.assign(new Error("CSRF validation failed."), { status: 403 }));
  next();
}

module.exports = { register, login, refresh, logout, authenticate, requireRole, csrfProtection, publicUser, accessCookie, csrfCookie };
