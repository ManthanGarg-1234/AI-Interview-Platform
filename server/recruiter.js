"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { createNotification } = require("./notifications");

const router = express.Router();
const companySchema = z.object({ name: z.string().trim().min(2).max(200), website: z.string().url().max(500).nullable().optional(), description: z.string().max(10_000).nullable().optional() });

async function member(userId, companyId) {
  return getPrisma().companyMember.findFirst({ where: { userId, companyId, active: true }, include: { company: true } });
}
function isAuthorizedCompanyMember(access, companyId, roles = ["OWNER", "HIRING_MANAGER", "REVIEWER"]) {
  return Boolean(access && access.companyId === companyId && access.active && roles.includes(access.role));
}
const jobInput = z.object({
  companyId: z.string().uuid(), title: z.string().trim().min(2).max(200), description: z.string().trim().min(10),
  location: z.string().trim().max(160).nullable().optional(), employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]),
  salaryMin: z.coerce.number().nonnegative().nullable().optional(), salaryMax: z.coerce.number().nonnegative().nullable().optional(),
  educationRequirement: z.string().max(2000).nullable().optional(), experienceRequirement: z.string().max(2000).nullable().optional(),
  deadline: z.coerce.date().nullable().optional(), skillIds: z.array(z.string().uuid()).max(50).optional(),
});
async function jobAccess(userId, jobId, roles = ["OWNER", "HIRING_MANAGER", "REVIEWER"]) {
  const job = await getPrisma().job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) return null;
  const access = await member(userId, job.companyId);
  return isAuthorizedCompanyMember(access, job.companyId, roles) ? { job, access } : null;
}
function verified(company) { return company.status === "VERIFIED"; }

router.get("/jobs", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    const jobs = await getPrisma().job.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, include: { company: true, skills: { include: { skill: true } }, _count: { select: { applications: true } } }, orderBy: { updatedAt: "desc" } });
    res.json({ data: jobs });
  } catch (error) { next(error); }
});
router.post("/jobs", async (req, res, next) => {
  try {
    const input = jobInput.parse(req.body); const access = await member(req.auth.sub, input.companyId);
    if (!access || !["OWNER", "HIRING_MANAGER"].includes(access.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Hiring manager access is required." } });
    const { skillIds = [], ...data } = input;
    const job = await getPrisma().job.create({ data: { ...data, createdByUserId: req.auth.sub, skills: { create: skillIds.map((skillId) => ({ skillId })) } }, include: { skills: { include: { skill: true } }, company: true } });
    res.status(201).json({ data: job });
  } catch (error) { next(error); }
});
router.patch("/jobs/:id", async (req, res, next) => {
  try {
    const access = await jobAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]); if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    if (["PUBLISHED", "CLOSED", "ARCHIVED"].includes(access.job.status)) return res.status(409).json({ error: { code: "JOB_LOCKED", message: "This job cannot be edited in its current state." } });
    const input = jobInput.partial().omit({ companyId: true, skillIds: true }).parse(req.body);
    const job = await getPrisma().job.update({ where: { id: access.job.id }, data: input, include: { company: true, skills: { include: { skill: true } } } }); res.json({ data: job });
  } catch (error) { next(error); }
});
router.post("/jobs/:id/:action", async (req, res, next) => {
  try {
    const access = await jobAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]); if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    const action = req.params.action; const nextStatus = { publish: "PUBLISHED", pause: "PAUSED", close: "CLOSED", archive: "ARCHIVED" }[action];
    if (!nextStatus) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown job action." } });
    if (action === "publish" && !verified(access.job.company)) return res.status(403).json({ error: { code: "COMPANY_NOT_VERIFIED", message: "Verify the company before publishing jobs." } });
    const job = await getPrisma().job.update({ where: { id: access.job.id }, data: { status: nextStatus, ...(action === "publish" ? { publishedAt: new Date() } : {}), ...(action === "close" ? { closedAt: new Date() } : {}) } });
    res.json({ data: job });
  } catch (error) { next(error); }
});
router.get("/applications", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    res.json({ data: await getPrisma().application.findMany({ where: { job: { companyId: { in: companies.map((c) => c.id) } } }, include: { job: true, student: { include: { studentProfile: true } }, stageHistory: { orderBy: { createdAt: "desc" } }, notes: { orderBy: { createdAt: "desc" } } }, orderBy: { updatedAt: "desc" } }) });
  } catch (error) { next(error); }
});
router.get("/candidates", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const q = String(req.query.q || "").trim();
    const now = new Date();
    const where = {
      status: "ACTIVE",
      studentProfile: { is: { discoverable: true } },
      consents: { some: { type: "PROFILE_DISCOVERY", status: "GRANTED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { studentProfile: { is: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { headline: { contains: q, mode: "insensitive" } }] } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      getPrisma().user.findMany({ where, select: { id: true, studentProfile: { include: { skills: { include: { skill: true } } } } }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" } }),
      getPrisma().user.count({ where }),
    ]);
    res.json({ data: { items, page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.patch("/applications/:id/status", async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["SCREENING", "SHORTLISTED", "ASSESSMENT", "TECHNICAL_INTERVIEW", "HR_INTERVIEW", "SELECTED", "REJECTED"]), reason: z.string().max(1000).optional() }).parse(req.body);
    const application = await getPrisma().application.findUnique({ where: { id: req.params.id }, include: { job: true } }); const access = application && await jobAccess(req.auth.sub, application.jobId);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    const transitions = { APPLIED: ["SCREENING", "REJECTED"], SCREENING: ["SHORTLISTED", "REJECTED"], SHORTLISTED: ["ASSESSMENT", "TECHNICAL_INTERVIEW", "REJECTED"], ASSESSMENT: ["TECHNICAL_INTERVIEW", "REJECTED"], TECHNICAL_INTERVIEW: ["HR_INTERVIEW", "SELECTED", "REJECTED"], HR_INTERVIEW: ["SELECTED", "REJECTED"] };
    if (!transitions[application.status]?.includes(input.status)) return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: `Cannot move an application from ${application.status} to ${input.status}.` } });
    const updated = await getPrisma().$transaction(async (tx) => { const result = await tx.application.update({ where: { id: application.id }, data: { status: input.status } }); await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus: input.status, changedByUserId: req.auth.sub, reason: input.reason } }); return result; });
    await createNotification({ userId: application.studentUserId, type: "APPLICATION", title: "Application status updated", body: `Your application for ${application.job.title} is now ${input.status.toLowerCase().replaceAll("_", " ")}.`, resourceType: "APPLICATION", resourceId: application.id });
    res.json({ data: updated });
  } catch (error) { next(error); }
});
router.post("/applications/:id/notes", async (req, res, next) => {
  try {
    const input = z.object({ body: z.string().trim().min(1).max(5000), private: z.boolean().default(true) }).parse(req.body);
    const application = await getPrisma().application.findUnique({ where: { id: req.params.id }, select: { jobId: true } }); if (!application || !await jobAccess(req.auth.sub, application.jobId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    res.status(201).json({ data: await getPrisma().recruiterNote.create({ data: { ...input, applicationId: req.params.id, authorUserId: req.auth.sub } }) });
  } catch (error) { next(error); }
});

router.get("/profile", async (req, res, next) => {
  try { res.json({ data: await getPrisma().recruiterProfile.findUnique({ where: { userId: req.auth.sub } }) }); } catch (error) { next(error); }
});

router.post("/companies", async (req, res, next) => {
  try {
    const input = companySchema.parse(req.body);
    const company = await getPrisma().$transaction(async (tx) => {
      const created = await tx.company.create({ data: input });
      await tx.companyMember.create({ data: { companyId: created.id, userId: req.auth.sub, role: "OWNER", acceptedAt: new Date() } });
      return created;
    });
    res.status(201).json({ data: company });
  } catch (error) { next(error); }
});

router.get("/companies", async (req, res, next) => {
  try { res.json({ data: await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, include: { members: true, verifications: { orderBy: { submittedAt: "desc" }, take: 1 } } }) }); } catch (error) { next(error); }
});

router.post("/companies/:id/verification", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access || !["OWNER", "HIRING_MANAGER"].includes(access.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Company owner access is required." } });
    const verification = await getPrisma().companyVerification.create({ data: { companyId: req.params.id, submittedByUserId: req.auth.sub, status: "PENDING_VERIFICATION", note: req.body.note || null } });
    res.status(201).json({ data: verification });
  } catch (error) { next(error); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    const companyIds = companies.map((company) => company.id);
    const [jobs, applications, interviews] = await Promise.all([getPrisma().job.count({ where: { companyId: { in: companyIds }, status: "PUBLISHED" } }), getPrisma().application.count({ where: { job: { companyId: { in: companyIds } } } }), getPrisma().interviewSession.count({ where: { application: { job: { companyId: { in: companyIds } } } } })]);
    res.json({ data: { companies: companyIds.length, activeJobs: jobs, applications, interviews } });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.isAuthorizedCompanyMember = isAuthorizedCompanyMember;
