"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { createNotification } = require("./notifications");

const router = express.Router();
const actionSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]), reason: z.string().trim().min(3).max(1000) });
const audit = (actorUserId, action, resourceType, resourceId, before, after) => getPrisma().auditLog.create({ data: { actorUserId, createdByUserId: actorUserId, action, resourceType, resourceId, before, after, requestId: `admin-${Date.now()}` } });

router.get("/dashboard", async (_req, res, next) => {
  try {
    const prisma = getPrisma();
    const [students, recruiters, companies, jobs, applications, assessments, submissions, interviews, security] = await Promise.all([
      prisma.user.count({ where: { role: "STUDENT" } }), prisma.user.count({ where: { role: "RECRUITER" } }), prisma.company.count(),
      prisma.job.count({ where: { status: "PUBLISHED" } }), prisma.application.count(), prisma.assessment.count(), prisma.codeSubmission.count(),
      prisma.interviewSession.count(), prisma.securityEvent.count({ where: { status: { not: "RESOLVED" } } }),
    ]);
    res.json({ data: { students, recruiters, companies, activeJobs: jobs, applications, assessments, codingSubmissions: submissions, interviews, openSecurityEvents: security } });
  } catch (error) { next(error); }
});

router.get("/users", async (req, res, next) => {
  try {
    const users = await getPrisma().user.findMany({ where: { ...(req.query.role ? { role: String(req.query.role) } : {}), ...(req.query.search ? { email: { contains: String(req.query.search), mode: "insensitive" } } : {}) }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, role: true, status: true, createdAt: true } });
    res.json({ data: users });
  } catch (error) { next(error); }
});

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    const input = actionSchema.parse(req.body);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, role: true, status: true } });
    if (!user) return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found." } });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { status: input.status } });
    await audit(req.auth.sub, "USER_STATUS_CHANGED", "User", user.id, { status: user.status }, { status: updated.status, reason: input.reason });
    await createNotification({ userId: user.id, type: "SECURITY", title: "Account status updated", body: `Your account status is now ${updated.status}.`, critical: true });
    res.json({ data: { id: updated.id, status: updated.status } });
  } catch (error) { next(error); }
});

router.get("/companies/verifications", async (_req, res, next) => {
  try { res.json({ data: await getPrisma().companyVerification.findMany({ orderBy: { submittedAt: "desc" }, include: { company: true } }) }); } catch (error) { next(error); }
});

router.patch("/companies/verifications/:id", async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["VERIFIED", "REJECTED", "PENDING_VERIFICATION", "SUSPENDED"]), note: z.string().trim().min(3).max(2000) }).parse(req.body);
    const prisma = getPrisma();
    const verification = await prisma.companyVerification.findUnique({ where: { id: req.params.id }, include: { company: true } });
    if (!verification) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Verification not found." } });
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.companyVerification.update({ where: { id: verification.id }, data: { status: input.status, note: input.note, reviewedByUserId: req.auth.sub, reviewedAt: new Date() } });
      await tx.company.update({ where: { id: verification.companyId }, data: { status: input.status } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: "COMPANY_VERIFICATION_DECIDED", resourceType: "Company", resourceId: verification.companyId, before: { status: verification.company.status }, after: { status: input.status, note: input.note }, requestId: `admin-${Date.now()}` } });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.get("/audit-logs", async (req, res, next) => {
  try { res.json({ data: await getPrisma().auditLog.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Number(req.query.limit) || 100, 200) }) }); } catch (error) { next(error); }
});

router.get("/security-events", async (_req, res, next) => {
  try { res.json({ data: await getPrisma().securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) }); } catch (error) { next(error); }
});

module.exports = router;
