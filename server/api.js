"use strict";

const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");
const { z } = require("zod");
const { register, login, refresh, logout, authenticate, requireRole, csrfProtection, publicUser } = require("./auth");
const { getPrisma } = require("./prisma");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimetype)),
});
router.use(express.json({ limit: "256kb" }));
router.get("/health", async (_req, res) => {
  let database = "not_configured";
  if (process.env.DATABASE_URL) {
    try { await getPrisma().$queryRaw`SELECT 1`; database = "ready"; }
    catch { database = "unavailable"; }
  }
  const ready = database === "ready";
  res.status(ready ? 200 : 503).json({ ok: ready, service: "api", database, redis: process.env.REDIS_URL ? "configured" : "not_configured" });
});
router.post("/auth/register", async (req, res, next) => { try { await register(req, res); } catch (error) { next(error); } });
router.post("/auth/login", async (req, res, next) => { try { await login(req, res); } catch (error) { next(error); } });
router.post("/auth/refresh", async (req, res, next) => { try { await refresh(req, res); } catch (error) { next(error); } });
router.use(csrfProtection);
router.post("/auth/logout", async (req, res, next) => { try { await logout(req, res); } catch (error) { next(error); } });
router.get("/auth/me", authenticate, async (req, res, next) => {
  try {
    const user = await getPrisma().user.findUnique({ where: { id: req.auth.sub }, include: { studentProfile: true, recruiterProfile: true } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer active." } });
    res.json({ data: publicUser(user) });
  } catch (error) { next(error); }
});
router.get("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, include: { skills: true, educations: true, projects: true } }); res.json({ data: profile }); }
  catch (error) { next(error); }
});
router.patch("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const data = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), headline: z.string().trim().max(180).nullable().optional(), bio: z.string().trim().max(5000).nullable().optional(), location: z.string().trim().max(160).nullable().optional(), discoverable: z.boolean().optional() }).parse(req.body);
    const profile = await getPrisma().studentProfile.update({ where: { userId: req.auth.sub }, data });
    res.json({ data: profile });
  } catch (error) { next(error); }
});
router.get("/me/resumes", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    const resumes = await getPrisma().resume.findMany({ where: { studentId: profile.id, deletedAt: null }, include: { activeVersion: { include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, scanStatus: true } } } } }, orderBy: { updatedAt: "desc" } });
    res.json({ data: resumes });
  } catch (error) { next(error); }
});
router.post("/me/resumes", authenticate, requireRole("STUDENT"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: "INVALID_FILE", message: "A PDF or DOCX resume up to 5 MB is required." } });
    const title = z.string().trim().min(1).max(200).parse(req.body.title || req.file.originalname);
    const prisma = getPrisma();
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    if (!profile) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Student profile was not found." } });
    const fileId = crypto.randomUUID();
    const objectKey = `resumes/${req.auth.sub}/${fileId}-${path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const root = path.resolve(process.env.STORAGE_ROOT || "server/data/uploads");
    await fs.mkdir(path.dirname(path.join(root, objectKey)), { recursive: true });
    await fs.writeFile(path.join(root, objectKey), req.file.buffer, { flag: "wx" });
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const resume = await prisma.$transaction(async (tx) => {
      const current = await tx.resume.findFirst({ where: { studentId: profile.id, deletedAt: null }, orderBy: { updatedAt: "desc" } });
      const target = current || await tx.resume.create({ data: { studentId: profile.id, title, visibility: "PRIVATE" } });
      const latest = await tx.resumeVersion.findFirst({ where: { resumeId: target.id }, orderBy: { version: "desc" }, select: { version: true } });
      const stored = await tx.storedFile.create({ data: { id: fileId, ownerUserId: req.auth.sub, objectKey, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, sha256, retentionClass: "RESUME", scanStatus: "PENDING" } });
      const version = await tx.resumeVersion.create({ data: { resumeId: target.id, fileId: stored.id, version: (latest?.version || 0) + 1, createdByUserId: req.auth.sub } });
      return tx.resume.update({ where: { id: target.id }, data: { title, activeVersionId: version.id }, include: { activeVersion: { include: { file: true } } } });
    });
    res.status(201).json({ data: resume });
  } catch (error) { next(error); }
});

module.exports = router;
