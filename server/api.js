"use strict";

const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const multer = require("multer");
const { z } = require("zod");
const { register, login, refresh, logout, authenticate, requireRole, csrfProtection, publicUser } = require("./auth");
const { getPrisma } = require("./prisma");
const storage = require("./private-storage");
const { enqueueResumeProcessing } = require("./resume-processing");

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
    const url = z.string().url().max(500).nullable().optional();
    const data = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), phone: z.string().trim().max(32).nullable().optional(), headline: z.string().trim().max(180).nullable().optional(), bio: z.string().trim().max(5000).nullable().optional(), location: z.string().trim().max(160).nullable().optional(), githubUrl: url, linkedinUrl: url, portfolioUrl: url, discoverable: z.boolean().optional() }).parse(req.body);
    const profile = await getPrisma().studentProfile.update({ where: { userId: req.auth.sub }, data });
    res.json({ data: profile });
  } catch (error) { next(error); }
});

const profileSections = {
  education: { model: "education", schema: z.object({ institution: z.string().trim().min(1).max(200), degree: z.string().trim().max(160).nullable().optional(), fieldOfStudy: z.string().trim().max(160).nullable().optional(), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional(), grade: z.coerce.number().min(0).max(100).nullable().optional() }) },
  projects: { model: "project", schema: z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(5000).nullable().optional(), url: z.string().url().max(500).nullable().optional(), repositoryUrl: z.string().url().max(500).nullable().optional(), technologies: z.array(z.string().trim().min(1).max(80)).max(50).optional() }) },
  experience: { model: "experience", schema: z.object({ organization: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(160), description: z.string().trim().max(5000).nullable().optional(), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional() }) },
  certifications: { model: "certification", schema: z.object({ name: z.string().trim().min(1).max(200), issuer: z.string().trim().max(200).nullable().optional(), credentialUrl: z.string().url().max(500).nullable().optional(), issuedAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional() }) },
};
async function profileId(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) { const error = new Error("Student profile was not found."); error.status = 404; throw error; }
  return profile.id;
}
for (const [section, config] of Object.entries(profileSections)) {
  router.get(`/me/${section}`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { res.json({ data: await getPrisma()[config.model].findMany({ where: { studentId: await profileId(req.auth.sub) }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); }
  });
  router.post(`/me/${section}`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { res.status(201).json({ data: await getPrisma()[config.model].create({ data: { ...config.schema.parse(req.body), studentId: await profileId(req.auth.sub) } }) }); } catch (error) { next(error); }
  });
  router.patch(`/me/${section}/:id`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try {
      const studentId = await profileId(req.auth.sub);
      const existing = await getPrisma()[config.model].findFirst({ where: { id: req.params.id, studentId } });
      if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found." } });
      res.json({ data: await getPrisma()[config.model].update({ where: { id: existing.id }, data: config.schema.parse(req.body) }) });
    } catch (error) { next(error); }
  });
  router.delete(`/me/${section}/:id`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { const deleted = await getPrisma()[config.model].deleteMany({ where: { id: req.params.id, studentId: await profileId(req.auth.sub) } }); if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found." } }); res.status(204).send(); } catch (error) { next(error); }
  });
}
router.get("/me/skills", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { res.json({ data: await getPrisma().studentSkill.findMany({ where: { studentId: await profileId(req.auth.sub) }, include: { skill: true }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); }
});
router.post("/me/skills", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().max(80).nullable().optional(), evidenceType: z.enum(["SELF_DECLARED", "PROJECT", "CERTIFICATION"]).default("SELF_DECLARED"), proficiency: z.number().min(0).max(100).nullable().optional() }).parse(req.body);
    const prisma = getPrisma(); const studentId = await profileId(req.auth.sub);
    const skill = await prisma.skill.upsert({ where: { name: input.name }, update: { category: input.category }, create: { name: input.name, category: input.category } });
    const data = await prisma.studentSkill.create({ data: { studentId, skillId: skill.id, evidenceType: input.evidenceType, proficiency: input.proficiency }, include: { skill: true } });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
router.delete("/me/skills/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const deleted = await getPrisma().studentSkill.deleteMany({ where: { id: req.params.id, studentId: await profileId(req.auth.sub) } }); if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Skill not found." } }); res.status(204).send(); } catch (error) { next(error); }
});
router.get("/me/resumes", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    const resumes = await getPrisma().resume.findMany({ where: { studentId: profile.id, deletedAt: null }, include: { activeVersion: { include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, scanStatus: true } } } }, versions: { include: { file: { select: { id: true, originalName: true, scanStatus: true, sizeBytes: true } } }, orderBy: { version: "desc" } } }, orderBy: { updatedAt: "desc" } });
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
    const storedObject = await storage.put(objectKey, req.file.buffer);
    const sha256 = storedObject.sha256;
    const resume = await prisma.$transaction(async (tx) => {
      const current = await tx.resume.findFirst({ where: { studentId: profile.id, deletedAt: null }, orderBy: { updatedAt: "desc" } });
      const target = current || await tx.resume.create({ data: { studentId: profile.id, title, visibility: "PRIVATE" } });
      const latest = await tx.resumeVersion.findFirst({ where: { resumeId: target.id }, orderBy: { version: "desc" }, select: { version: true } });
      const stored = await tx.storedFile.create({ data: { id: fileId, ownerUserId: req.auth.sub, objectKey, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, sha256, retentionClass: "RESUME", scanStatus: "PENDING" } });
      const version = await tx.resumeVersion.create({ data: { resumeId: target.id, fileId: stored.id, version: (latest?.version || 0) + 1, createdByUserId: req.auth.sub } });
      await tx.resumeProcessingJob.create({ data: { resumeVersionId: version.id, status: "PENDING" } });
      return tx.resume.update({ where: { id: target.id }, data: { title, activeVersionId: version.id }, include: { activeVersion: { include: { file: true } } } });
    });
    await enqueueResumeProcessing(resume.activeVersionId);
    res.status(201).json({ data: resume });
  } catch (error) { next(error); }
});
router.patch("/me/resumes/:id/active", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const version = await getPrisma().resumeVersion.findFirst({ where: { id: req.params.id, resume: { studentId: await profileId(req.auth.sub), deletedAt: null }, file: { scanStatus: "CLEAN", deletedAt: null } } }); if (!version) return res.status(404).json({ error: { code: "VERSION_NOT_AVAILABLE", message: "Resume version is unavailable or has not passed scanning." } }); res.json({ data: await getPrisma().resume.update({ where: { id: version.resumeId }, data: { activeVersionId: version.id } }) }); } catch (error) { next(error); }
});
router.delete("/me/resumes/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const resume = await getPrisma().resume.findFirst({ where: { id: req.params.id, studentId: await profileId(req.auth.sub), deletedAt: null }, include: { versions: { include: { file: true } } } }); if (!resume) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resume not found." } }); await getPrisma().resume.update({ where: { id: resume.id }, data: { deletedAt: new Date(), activeVersionId: null } }); await Promise.all(resume.versions.map((version) => storage.remove(version.file.objectKey))); await getPrisma().storedFile.updateMany({ where: { id: { in: resume.versions.map((version) => version.fileId) } }, data: { deletedAt: new Date(), scanStatus: "DELETED" } }); res.status(204).send(); } catch (error) { next(error); }
});
router.get("/me/resume-versions/:id/download", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const version = await getPrisma().resumeVersion.findFirst({ where: { id: req.params.id, resume: { studentId: await profileId(req.auth.sub), deletedAt: null }, file: { scanStatus: "CLEAN", deletedAt: null } }, include: { file: true } }); if (!version) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resume file is unavailable." } }); const buffer = await storage.get(version.file.objectKey); res.set({ "Content-Type": version.file.mimeType, "Content-Disposition": `attachment; filename="${version.file.originalName.replace(/["\r\n]/g, "")}"`, "Cache-Control": "private, no-store" }).send(buffer); } catch (error) { next(error); }
});

module.exports = router;
