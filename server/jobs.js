"use strict";
const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { createNotification } = require("./notifications");
const router = express.Router();

async function findAccessibleResume(prisma, resumeId, userId) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile || !resumeId) return null;
  return prisma.resume.findFirst({
    where: { id: resumeId, studentId: profile.id, deletedAt: null, activeVersionId: { not: null } },
    include: { activeVersion: { include: { file: { select: { scanStatus: true, deletedAt: true } } } } },
  }).then((resume) => resume?.activeVersion?.file?.scanStatus === "CLEAN" && !resume.activeVersion.file.deletedAt ? resume : null);
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const q = String(req.query.q || "").trim(), location = String(req.query.location || "").trim();
    const where = { status: "PUBLISHED", ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}), ...(location ? { location: { contains: location, mode: "insensitive" } } : {}) };
    const [items, total] = await Promise.all([
      getPrisma().job.findMany({ where, include: { company: { select: { id: true, name: true, website: true } }, skills: { include: { skill: true } } }, orderBy: { publishedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      getPrisma().job.count({ where }),
    ]);
    res.json({ data: { items, page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.get("/me/bookmarks", async (req, res, next) => { try { res.json({ data: await getPrisma().jobBookmark.findMany({ where: { userId: req.auth.sub }, include: { job: { include: { company: true, skills: { include: { skill: true } } } } }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); } });
router.get("/me/applications", async (req, res, next) => { try { res.json({ data: await getPrisma().application.findMany({ where: { studentUserId: req.auth.sub }, include: { job: { include: { company: true } }, stageHistory: { orderBy: { createdAt: "desc" } } }, orderBy: { updatedAt: "desc" } }) }); } catch (error) { next(error); } });
router.get("/:id", async (req, res, next) => {
  try {
    const job = await getPrisma().job.findFirst({ where: { id: req.params.id, status: "PUBLISHED" }, include: { company: true, skills: { include: { skill: true } } } });
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    res.json({ data: job });
  } catch (error) { next(error); }
});
router.post("/:id/bookmark", async (req, res, next) => {
  try {
    const job = await getPrisma().job.findFirst({ where: { id: req.params.id, status: "PUBLISHED" } }); if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    res.status(201).json({ data: await getPrisma().jobBookmark.upsert({ where: { userId_jobId: { userId: req.auth.sub, jobId: job.id } }, update: {}, create: { userId: req.auth.sub, jobId: job.id } }) });
  } catch (error) { next(error); }
});
router.delete("/:id/bookmark", async (req, res, next) => { try { await getPrisma().jobBookmark.deleteMany({ where: { userId: req.auth.sub, jobId: req.params.id } }); res.status(204).send(); } catch (error) { next(error); } });
router.post("/:id/apply", async (req, res, next) => {
  try {
    const input = z.object({ consent: z.literal(true), resumeId: z.string().uuid().optional() }).parse(req.body);
    const prisma = getPrisma(); const [job, profile, resume] = await Promise.all([prisma.job.findFirst({ where: { id: req.params.id, status: "PUBLISHED" } }), prisma.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { discoverable: true } }), input.resumeId ? findAccessibleResume(prisma, input.resumeId, req.auth.sub) : null]);
    if (!job) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    if (input.resumeId && !resume) return res.status(403).json({ error: { code: "RESUME_NOT_ACCESSIBLE", message: "The selected resume is not active, clean, or owned by you." } });
    const existing = await prisma.application.findFirst({ where: { jobId: job.id, studentUserId: req.auth.sub, status: { not: "WITHDRAWN" } } }); if (existing) return res.status(409).json({ error: { code: "ALREADY_APPLIED", message: "You already applied to this job." } });
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({ data: { jobId: job.id, studentUserId: req.auth.sub, resumeId: input.resumeId, consentSnapshot: { candidateConsent: true, discoverable: Boolean(profile?.discoverable), capturedAt: new Date().toISOString() } } });
      await tx.applicationStageHistory.create({ data: { applicationId: created.id, toStatus: "APPLIED", changedByUserId: req.auth.sub } });
      return created;
    });
    const recruiters = await prisma.companyMember.findMany({ where: { companyId: job.companyId, active: true }, select: { userId: true } });
    await Promise.all(recruiters.map((r) => createNotification({ userId: r.userId, type: "APPLICATION", title: "New job application", body: `A candidate applied for ${job.title}.`, resourceType: "APPLICATION", resourceId: application.id })));
    res.status(201).json({ data: application });
  } catch (error) { next(error); }
});
router.post("/applications/:id/withdraw", async (req, res, next) => {
  try { const updated = await getPrisma().application.updateMany({ where: { id: req.params.id, studentUserId: req.auth.sub, status: { notIn: ["WITHDRAWN", "REJECTED", "SELECTED"] } }, data: { status: "WITHDRAWN" } }); if (!updated.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found or cannot be withdrawn." } }); res.status(204).send(); } catch (error) { next(error); }
});
module.exports = router;
module.exports.findAccessibleResume = findAccessibleResume;
