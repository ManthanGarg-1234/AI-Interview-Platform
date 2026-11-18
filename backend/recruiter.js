"use strict";

const express = require("express");
const crypto = require("node:crypto");
const multer = require("multer");
const Redis = require("ioredis");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { createNotification } = require("./notifications");
const storage = require("./private-storage");

const router = express.Router();
let analyticsRedis;
function redisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!analyticsRedis) {
    const url = new URL(process.env.REDIS_URL);
    analyticsRedis = new Redis({ host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, connectTimeout: 500, maxRetriesPerRequest: 1, lazyConnect: true, retryStrategy: () => null });
    analyticsRedis.on("error", () => {});
  }
  return analyticsRedis;
}
async function cached(key, loader) {
  const client = redisClient();
  if (client) {
    try {
      if (client.status === "wait") await client.connect();
      const hit = await client.get(key);
      if (hit) { const value = JSON.parse(hit); client.disconnect(); analyticsRedis = undefined; return value; }
    } catch { /* Redis is an optional cache. */ }
  }
  const value = await loader();
  if (client) {
    try { await client.set(key, JSON.stringify(value), "EX", 30); } catch { /* Cache failure must not block analytics. */ }
    client.disconnect();
    analyticsRedis = undefined;
  }
  return value;
}
async function resetAnalyticsRedis() {
  if (analyticsRedis) analyticsRedis.disconnect();
  analyticsRedis = undefined;
}
async function invalidateRecruiterCache(companyIds) {
  const client = redisClient();
  if (!client || !companyIds?.length) return;
  try {
    if (client.status === "wait") await client.connect();
    const keys = [];
    for (const companyId of companyIds) keys.push(...await client.keys(`recruiter:*${companyId}*`));
    if (keys.length) await client.del(...[...new Set(keys)]);
  } catch { /* Redis is an optional cache. */ }
  client.disconnect();
  analyticsRedis = undefined;
}
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const LOGO_SIGNATURES = {
  "image/png": (buffer) => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/jpeg": (buffer) => buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  "image/webp": (buffer) => buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP",
};
const normalizeCompanyUrl = (value) => {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw) return raw;
  const candidate = /^[a-z][a-z\d+\-.]*:/i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, "");
};
const httpUrl = z.string().trim().refine((value) => {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol); } catch { return false; }
}, "Only http:// and https:// links are allowed").max(500);
const companySchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.preprocess((value) => value == null ? value : normalizeCompanyUrl(value), httpUrl).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  officialEmailDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/, "Enter a domain like xyz.com").max(253).nullable().optional(),
  logoUrl: z.preprocess((value) => value == null ? value : normalizeCompanyUrl(value), httpUrl.max(2048)).nullable().optional(),
  metadata: z.object({
    industry: z.string().trim().max(160).optional(),
    companySize: z.string().trim().max(80).optional(),
    headquarters: z.string().trim().max(160).optional(),
    locations: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    socialLinks: z.record(z.string(), httpUrl).optional(),
  }).optional(),
});

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
  metadata: z.object({
    department: z.string().trim().max(160).optional(),
    category: z.string().trim().max(160).optional(),
    workMode: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
    vacancies: z.coerce.number().int().min(1).max(10000).optional(),
    responsibilities: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
    requirements: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
    benefits: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
    preferredSkills: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  }).optional(),
});
const assessmentInput = z.object({
  companyId: z.string().uuid(),
  title: z.string().trim().min(2).max(240),
  type: z.enum(["TECHNICAL", "APTITUDE", "CODING", "SQL", "SUBJECT", "PRACTICE", "RECRUITER"]),
  durationSeconds: z.coerce.number().int().min(60).max(86_400),
  negativeMarking: z.coerce.number().min(0).max(100).default(0),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(1),
  questionIds: z.array(z.string().uuid()).max(200).default([]),
  codingProblemIds: z.array(z.string().uuid()).max(50).default([]),
});
const assignmentInput = z.object({
  studentUserId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
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
    const jobId = req.params.id;
    const access = await jobAccess(req.auth.sub, jobId, ["OWNER", "HIRING_MANAGER"]); if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    if (["CLOSED", "ARCHIVED"].includes(access.job.status)) return res.status(409).json({ error: { code: "JOB_LOCKED", message: "This job cannot be edited in its current state." } });
    const input = jobInput.partial().omit({ companyId: true, skillIds: true }).parse(req.body);
    const prisma = getPrisma();
    const before = Object.fromEntries(Object.keys(input).map((key) => [key, access.job[key]]));
    const job = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({ where: { id: access.job.id }, data: input, include: { company: true, skills: { include: { skill: true } } } });
      await tx.auditLog.create({
        data: {
          actorUserId: req.auth.sub,
          createdByUserId: req.auth.sub,
          action: "JOB_EDITED",
          resourceType: "JOB",
          resourceId: jobId,
          before,
          after: Object.fromEntries(Object.keys(input).map((key) => [key, updated[key]])),
          requestId: req.requestId || "recruiter-job-edit",
        },
      });
      return updated;
    });
    await invalidateRecruiterCache([access.job.companyId]);
    res.json({ data: job });
  } catch (error) { next(error); }
});
router.post("/jobs/:id/:action", async (req, res, next) => {
  try {
    const access = await jobAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]); if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    const action = req.params.action; const nextStatus = { publish: "PUBLISHED", pause: "PAUSED", close: "CLOSED", archive: "ARCHIVED" }[action];
    if (!nextStatus) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown job action." } });
    const validTransitions = {
      publish: ["DRAFT"],
      pause: ["PUBLISHED"],
      close: ["PUBLISHED", "PAUSED"],
      archive: ["CLOSED"],
    };
    if (!validTransitions[action].includes(access.job.status)) {
      return res.status(409).json({ error: { code: "INVALID_JOB_TRANSITION", message: `Cannot ${action} a job in ${access.job.status} status.` } });
    }
    if (action === "publish" && !verified(access.job.company)) return res.status(403).json({ error: { code: "COMPANY_NOT_VERIFIED", message: "Verify the company before publishing jobs." } });
    const prisma = getPrisma();
    const job = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({ where: { id: access.job.id }, data: { status: nextStatus, ...(action === "publish" ? { publishedAt: new Date() } : {}), ...(action === "close" ? { closedAt: new Date() } : {}) } });
      await tx.auditLog.create({
        data: {
          actorUserId: req.auth.sub,
          createdByUserId: req.auth.sub,
          action: `JOB_${action.toUpperCase()}`,
          resourceType: "JOB",
          resourceId: access.job.id,
          before: { status: access.job.status },
          after: { status: nextStatus },
          requestId: req.requestId || "recruiter-job-action",
        },
      });
      return updated;
    });
    await invalidateRecruiterCache([access.job.companyId]);
    res.json({ data: job });
  } catch (error) { next(error); }
});
router.post("/jobs/:id/duplicate", async (req, res, next) => {
  try {
    const access = await jobAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Job not found." } });
    const source = await getPrisma().job.findUnique({ where: { id: access.job.id }, include: { skills: true } });
    const duplicated = await getPrisma().job.create({
      data: {
        companyId: source.companyId,
        createdByUserId: req.auth.sub,
        title: `${source.title} (Copy)`,
        description: source.description,
        location: source.location,
        employmentType: source.employmentType,
        salaryMin: source.salaryMin,
        salaryMax: source.salaryMax,
        educationRequirement: source.educationRequirement,
        experienceRequirement: source.experienceRequirement,
        deadline: source.deadline,
        metadata: source.metadata,
        skills: { create: source.skills.map(({ skillId, required }) => ({ skillId, required })) },
      },
      include: { company: true, skills: { include: { skill: true } } },
    });
    res.status(201).json({ data: duplicated });
  } catch (error) { next(error); }
});
router.get("/applications", async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const q = String(req.query.q || "").trim();
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    const where = {
      job: { companyId: { in: companies.map((c) => c.id) } },
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { student: { fullName: { contains: q, mode: "insensitive" } } },
        { student: { email: { contains: q, mode: "insensitive" } } },
        { job: { title: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    };
    res.json({ data: await getPrisma().application.findMany({ where, include: { job: { include: { company: true } }, student: { include: { studentProfile: { include: { skills: { include: { skill: true } } } } } }, stageHistory: { orderBy: { createdAt: "desc" } }, notes: { orderBy: { createdAt: "desc" } } }, orderBy: { updatedAt: "desc" } }) });
  } catch (error) { next(error); }
});
router.get("/applications/:id", async (req, res, next) => {
  try {
    const application = await getPrisma().application.findUnique({
      where: { id: req.params.id },
      include: {
        job: { include: { company: true, skills: { include: { skill: true } } } },
        student: { include: { studentProfile: { include: { skills: { include: { skill: true } }, educations: true, experiences: true, projects: true, certifications: true, resumes: { include: { activeVersion: { include: { file: true } } } } } } } },
        resume: { include: { activeVersion: { include: { file: true } } } },
        stageHistory: { orderBy: { createdAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        assessmentAssignments: { include: { assessment: true, attempts: { include: { result: true } } } },
        recruiterInterviews: { include: { rounds: true, scorecards: true } },
        offers: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!application || !await jobAccess(req.auth.sub, application.jobId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    res.json({ data: application });
  } catch (error) { next(error); }
});
router.get("/candidates", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const q = String(req.query.q || "").trim();
    const location = String(req.query.location || "").trim();
    const skill = String(req.query.skill || "").trim();
    const education = String(req.query.education || "").trim();
    const now = new Date();
    const profileFilter = { discoverable: true };
    if (location) profileFilter.location = { contains: location, mode: "insensitive" };
    if (skill) profileFilter.skills = { some: { skill: { name: { contains: skill, mode: "insensitive" } } } };
    if (education) profileFilter.educations = { some: { OR: [{ institution: { contains: education, mode: "insensitive" } }, { degree: { contains: education, mode: "insensitive" } }, { fieldOfStudy: { contains: education, mode: "insensitive" } }] } };
    const where = {
      status: "ACTIVE",
      studentProfile: { is: profileFilter },
      consents: { some: { type: "PROFILE_DISCOVERY", status: "GRANTED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { studentProfile: { is: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { headline: { contains: q, mode: "insensitive" } }] } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      getPrisma().user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          studentProfile: {
            include: {
              skills: { include: { skill: true } },
              educations: { orderBy: { endDate: "desc" }, take: 3 },
              resumes: {
                where: { deletedAt: null },
                include: { activeVersion: { include: { file: { select: { scanStatus: true } } } } },
                take: 5,
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      getPrisma().user.count({ where }),
    ]);
    res.json({ data: { items, page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
router.patch("/applications/:id/status", async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["SCREENING", "SHORTLISTED", "ASSESSMENT", "TECHNICAL_INTERVIEW", "HR_INTERVIEW", "SELECTED", "OFFER_RELEASED", "HIRED", "REJECTED"]), reason: z.string().max(1000).optional() }).parse(req.body);
    const application = await getPrisma().application.findUnique({ where: { id: req.params.id }, include: { job: true } }); const access = application && await jobAccess(req.auth.sub, application.jobId);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    const transitions = { APPLIED: ["SCREENING", "REJECTED"], SCREENING: ["SHORTLISTED", "REJECTED"], SHORTLISTED: ["ASSESSMENT", "TECHNICAL_INTERVIEW", "REJECTED"], ASSESSMENT: ["TECHNICAL_INTERVIEW", "REJECTED"], TECHNICAL_INTERVIEW: ["HR_INTERVIEW", "SELECTED", "REJECTED"], HR_INTERVIEW: ["SELECTED", "OFFER_RELEASED", "REJECTED"], SELECTED: ["OFFER_RELEASED", "REJECTED"], OFFER_RELEASED: ["HIRED", "REJECTED"], HIRED: [], REJECTED: [] };
    if (!transitions[application.status]?.includes(input.status)) return res.status(409).json({ error: { code: "INVALID_TRANSITION", message: `Cannot move an application from ${application.status} to ${input.status}.` } });
    if (input.status === "HIRED") {
      const acceptedOffer = await getPrisma().offer.findFirst({ where: { applicationId: application.id, studentUserId: application.studentUserId, status: "ACCEPTED" } });
      if (!acceptedOffer) return res.status(409).json({ error: { code: "HIRED_OFFER_REQUIRED", message: "An accepted offer is required before moving this application to HIRED." } });
    }
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.application.update({ where: { id: application.id }, data: { status: input.status } });
      await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus: input.status, changedByUserId: req.auth.sub, reason: input.reason } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: "APPLICATION_STAGE_MOVED", resourceType: "APPLICATION", resourceId: application.id, before: { status: application.status }, after: { status: input.status }, requestId: req.requestId || "recruiter-stage-move" } });
      await tx.notification.create({ data: { userId: application.studentUserId, type: "APPLICATION", title: "Application status updated", body: `Your application for ${application.job.title} moved to ${input.status.toLowerCase().replaceAll("_", " ")}.`, resourceType: "APPLICATION", resourceId: application.id } });
      return result;
    });
    await invalidateRecruiterCache([application.job.companyId]);
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
router.put("/applications/:id/tags", async (req, res, next) => {
  try {
    const input = z.object({ tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]) }).parse(req.body);
    const application = await getPrisma().application.findUnique({ where: { id: req.params.id }, include: { job: true } });
    if (!application || !await jobAccess(req.auth.sub, application.jobId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    const tags = [...new Set(input.tags)];
    res.json({ data: await getPrisma().application.update({ where: { id: application.id }, data: { internalTags: tags } }) });
  } catch (error) { next(error); }
});
router.post("/applications/compare", async (req, res, next) => {
  try {
    const input = z.object({ applicationIds: z.array(z.string().uuid()).min(2).max(6) }).parse(req.body);
    const items = await getPrisma().application.findMany({
      where: { id: { in: input.applicationIds } },
      include: {
        job: { include: { skills: { include: { skill: true } } } },
        student: { include: { studentProfile: { include: { skills: { include: { skill: true } }, educations: true, experiences: true } } } },
        assessmentAssignments: { include: { attempts: { include: { result: true } } } },
      },
    });
    const accessible = [];
    for (const item of items) {
      if (await jobAccess(req.auth.sub, item.jobId)) accessible.push(item);
    }
    res.json({ data: accessible });
  } catch (error) { next(error); }
});

const offerInput = z.object({
  applicationId: z.string().uuid(),
  designation: z.string().trim().min(2).max(200),
  compensation: z.object({
    currency: z.string().trim().min(3).max(8).default("INR"),
    baseSalary: z.coerce.number().nonnegative(),
    variable: z.coerce.number().nonnegative().optional(),
    bonus: z.coerce.number().nonnegative().optional(),
  }),
  joiningDate: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

router.get("/offers", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    const offers = await getPrisma().offer.findMany({
      where: { application: { job: { companyId: { in: companies.map((company) => company.id) } } } },
      include: { application: { include: { student: { select: { id: true, fullName: true, email: true } } } }, job: true },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ data: offers });
  } catch (error) { next(error); }
});
router.post("/offers", async (req, res, next) => {
  try {
    const input = offerInput.parse(req.body);
    if (input.expiresAt <= input.joiningDate) return res.status(400).json({ error: { code: "INVALID_OFFER_WINDOW", message: "Offer expiry must be later than the joining date." } });
    const application = await getPrisma().application.findUnique({ where: { id: input.applicationId }, include: { job: true } });
    if (!application || !await jobAccess(req.auth.sub, application.jobId, ["OWNER", "HIRING_MANAGER"])) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Application not found." } });
    const offer = await getPrisma().$transaction(async (tx) => {
      const created = await tx.offer.create({
        data: {
          applicationId: application.id,
          jobId: application.jobId,
          studentUserId: application.studentUserId,
          createdByUserId: req.auth.sub,
          designation: input.designation,
          compensation: input.compensation,
          joiningDate: input.joiningDate,
          expiresAt: input.expiresAt,
        },
      });
      await tx.application.update({ where: { id: application.id }, data: { status: "SELECTED" } });
      await tx.applicationStageHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus: "SELECTED", changedByUserId: req.auth.sub, reason: "Offer created" } });
      return created;
    });
    await createNotification({ userId: application.studentUserId, type: "APPLICATION", title: "Offer created", body: `An offer has been prepared for ${application.job.title}.`, resourceType: "OFFER", resourceId: offer.id }).catch(() => null);
    await invalidateRecruiterCache([application.job.companyId]);
    res.status(201).json({ data: offer });
  } catch (error) { next(error); }
});
router.post("/offers/:id/:action", async (req, res, next) => {
  try {
    const offer = await getPrisma().offer.findUnique({ where: { id: req.params.id }, include: { application: { include: { job: true } } } });
    if (!offer || !await jobAccess(req.auth.sub, offer.jobId, ["OWNER", "HIRING_MANAGER"])) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Offer not found." } });
    const action = req.params.action;
    const nextStatus = { send: "SENT", withdraw: "WITHDRAWN", expire: "EXPIRED", hire: "ACCEPTED" }[action];
    if (!nextStatus) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown offer action." } });
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.offer.update({ where: { id: offer.id }, data: { status: nextStatus, ...(action === "send" ? { sentAt: new Date() } : {}), ...(action === "hire" ? { respondedAt: new Date(), status: "ACCEPTED" } : {}) } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: `OFFER_${action.toUpperCase()}`, resourceType: "OFFER", resourceId: offer.id, before: { status: offer.status }, after: { status: nextStatus }, requestId: req.requestId || "recruiter-offer-action" } });
      if (action === "send") await tx.application.update({ where: { id: offer.applicationId }, data: { status: "OFFER_RELEASED" } });
      if (action === "hire") await tx.application.update({ where: { id: offer.applicationId }, data: { status: "HIRED" } });
      return result;
    });
    await createNotification({ userId: offer.studentUserId, type: "APPLICATION", title: action === "send" ? "Offer received" : "Offer updated", body: action === "send" ? `A job offer for ${offer.application.job.title} is available.` : `The status of your offer has changed to ${nextStatus.toLowerCase()}.`, resourceType: "OFFER", resourceId: offer.id }).catch(() => null);
    await invalidateRecruiterCache([offer.application.job.companyId]);
    res.json({ data: updated });
  } catch (error) { next(error); }
});

async function assessmentAccess(userId, assessmentId, roles = ["OWNER", "HIRING_MANAGER", "REVIEWER"]) {
  const assessment = await getPrisma().assessment.findUnique({ where: { id: assessmentId }, include: { ownerCompany: true } });
  if (!assessment?.ownerCompanyId) return null;
  const access = await member(userId, assessment.ownerCompanyId);
  return isAuthorizedCompanyMember(access, assessment.ownerCompanyId, roles) ? { assessment, access } : null;
}

function assessmentView(assessment) {
  return {
    id: assessment.id, companyId: assessment.ownerCompanyId, title: assessment.title, type: assessment.type,
    status: assessment.status, durationSeconds: assessment.durationSeconds, negativeMarking: Number(assessment.negativeMarking),
    maxAttempts: assessment.maxAttempts, publishedAt: assessment.publishedAt,
    questionCount: assessment.questions?.length || 0, codingProblemCount: assessment.codingProblems?.length || 0,
  };
}

router.get("/assessments", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true, role: { in: ["OWNER", "HIRING_MANAGER", "REVIEWER"] } } } }, select: { id: true } });
    const items = await getPrisma().assessment.findMany({
      where: { ownerCompanyId: { in: companies.map((item) => item.id) } },
      include: { questions: true, codingProblems: true }, orderBy: { updatedAt: "desc" },
    });
    res.json({ data: items.map(assessmentView) });
  } catch (error) { next(error); }
});

router.post("/assessments", async (req, res, next) => {
  try {
    const input = assessmentInput.parse(req.body);
    const access = await member(req.auth.sub, input.companyId);
    if (!isAuthorizedCompanyMember(access, input.companyId, ["OWNER", "HIRING_MANAGER"])) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Hiring manager access is required." } });
    const { questionIds, codingProblemIds, companyId, ...data } = input;
    const prisma = getPrisma();
    const [questions, problems] = await Promise.all([
      prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true } }),
      prisma.codingProblem.findMany({ where: { id: { in: codingProblemIds }, status: { in: ["PUBLISHED", "ACTIVE"] } }, select: { id: true } }),
    ]);
    if (questions.length !== questionIds.length || problems.length !== codingProblemIds.length) return res.status(400).json({ error: { code: "INVALID_CONTENT", message: "One or more selected questions or coding problems are unavailable." } });
    const assessment = await prisma.assessment.create({
      data: { ...data, ownerCompanyId: companyId, createdByUserId: req.auth.sub,
        questions: { create: questionIds.map((questionId, sequence) => ({ questionId, sequence, points: 1 })) },
        codingProblems: { create: codingProblemIds.map((problemId, sequence) => ({ problemId, sequence, points: 1 })) } },
      include: { questions: true, codingProblems: true },
    });
    res.status(201).json({ data: assessmentView(assessment) });
  } catch (error) { next(error); }
});

router.patch("/assessments/:id", async (req, res, next) => {
  try {
    const access = await assessmentAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    if (access.assessment.status !== "DRAFT") return res.status(409).json({ error: { code: "ASSESSMENT_LOCKED", message: "Only draft assessments can be edited." } });
    const input = assessmentInput.partial().omit({ companyId: true }).parse(req.body);
    const { questionIds, codingProblemIds, ...data } = input;
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.assessment.update({ where: { id: access.assessment.id }, data });
      if (questionIds) {
        await tx.assessmentQuestion.deleteMany({ where: { assessmentId: access.assessment.id } });
        await tx.assessmentQuestion.createMany({ data: questionIds.map((questionId, sequence) => ({ assessmentId: access.assessment.id, questionId, sequence, points: 1 })) });
      }
      if (codingProblemIds) {
        await tx.assessmentCodingProblem.deleteMany({ where: { assessmentId: access.assessment.id } });
        await tx.assessmentCodingProblem.createMany({ data: codingProblemIds.map((problemId, sequence) => ({ assessmentId: access.assessment.id, problemId, sequence, points: 1 })) });
      }
    });
    const updated = await prisma.assessment.findUnique({ where: { id: access.assessment.id }, include: { questions: true, codingProblems: true } });
    res.json({ data: assessmentView(updated) });
  } catch (error) { next(error); }
});

router.post("/assessments/:id/status/:action", async (req, res, next) => {
  try {
    const access = await assessmentAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    const action = req.params.action;
    if (action === "publish") {
      if (access.assessment.status !== "DRAFT") return res.status(409).json({ error: { code: "INVALID_STATE", message: "Only draft assessments can be published." } });
      const count = await getPrisma().assessmentQuestion.count({ where: { assessmentId: access.assessment.id } });
      const codingCount = await getPrisma().assessmentCodingProblem.count({ where: { assessmentId: access.assessment.id } });
      if (!count && !codingCount) return res.status(409).json({ error: { code: "EMPTY_ASSESSMENT", message: "Add at least one question or coding problem." } });
      const updated = await getPrisma().assessment.update({ where: { id: access.assessment.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      return res.json({ data: assessmentView(updated) });
    }
    if (action === "deactivate") {
      const updated = await getPrisma().assessment.update({ where: { id: access.assessment.id }, data: { status: "PAUSED" } });
      return res.json({ data: assessmentView(updated) });
    }
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown assessment action." } });
  } catch (error) { next(error); }
});

router.get("/assessments/:id/content", async (req, res, next) => {
  try {
    const access = await assessmentAccess(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    const [questions, codingProblems] = await Promise.all([
      getPrisma().question.findMany({ select: { id: true, body: true, type: true, difficulty: true, options: true }, take: 200 }),
      getPrisma().codingProblem.findMany({ where: { status: { in: ["PUBLISHED", "ACTIVE"] } }, select: { id: true, title: true, difficulty: true }, take: 100 }),
    ]);
    res.json({ data: { questions, codingProblems } });
  } catch (error) { next(error); }
});

router.post("/assessments/:id/assignments", async (req, res, next) => {
  try {
    const input = assignmentInput.parse(req.body);
    const access = await assessmentAccess(req.auth.sub, req.params.id, ["OWNER", "HIRING_MANAGER"]);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    if (access.assessment.status !== "PUBLISHED") return res.status(409).json({ error: { code: "ASSESSMENT_NOT_PUBLISHED", message: "Publish the assessment before assigning it." } });
    const prisma = getPrisma();
    const student = await prisma.user.findFirst({ where: { id: input.studentUserId, role: "STUDENT", status: "ACTIVE" }, select: { id: true } });
    if (!student) return res.status(400).json({ error: { code: "INELIGIBLE_APPLICANT", message: "Only active student applicants can be assigned." } });
    let application = null;
    if (input.applicationId) application = await prisma.application.findUnique({ where: { id: input.applicationId }, include: { job: true } });
    const jobId = input.jobId || application?.jobId;
    const job = jobId && await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== access.assessment.ownerCompanyId || job.status === "ARCHIVED" || job.status === "CLOSED") return res.status(400).json({ error: { code: "INELIGIBLE_APPLICANT", message: "The job is not owned by this company or is closed." } });
    if (!application || application.studentUserId !== student.id || application.jobId !== job.id || ["REJECTED", "WITHDRAWN"].includes(application.status)) return res.status(400).json({ error: { code: "INELIGIBLE_APPLICANT", message: "Only eligible applicants for the selected job may be assigned." } });
    const assignment = await prisma.assessmentAssignment.create({ data: { assessmentId: access.assessment.id, studentUserId: student.id, assignedByUserId: req.auth.sub, jobId: job.id, applicationId: application.id, startsAt: input.startsAt, dueAt: input.dueAt } });
    await createNotification({ userId: student.id, type: "ASSESSMENT", title: "New assessment invitation", body: `You have been invited to complete ${access.assessment.title}.`, resourceType: "ASSESSMENT", resourceId: access.assessment.id }).catch(() => null);
    res.status(201).json({ data: assignment });
  } catch (error) { next(error); }
});

router.get("/assessments/:id/reviews", async (req, res, next) => {
  try {
    const access = await assessmentAccess(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    const assignments = await getPrisma().assessmentAssignment.findMany({ where: { assessmentId: access.assessment.id }, include: { student: { select: { id: true, studentProfile: { select: { firstName: true, lastName: true } } } }, attempts: { where: { status: { in: ["SUBMITTED", "GRADED", "EXPIRED"] } }, orderBy: { attemptNumber: "desc" }, take: 1, include: { result: true, reviews: true } } } });
    res.json({ data: assignments.map((item) => ({ assignmentId: item.id, student: item.student, status: item.status, attempt: item.attempts[0] ? { id: item.attempts[0].id, status: item.attempts[0].status, score: item.attempts[0].score, result: item.attempts[0].result, review: item.attempts[0].reviews[0] || null } : null })) });
  } catch (error) { next(error); }
});

router.put("/assessments/:id/attempts/:attemptId/review", async (req, res, next) => {
  try {
    const input = z.object({ rating: z.coerce.number().int().min(1).max(5).nullable().optional(), note: z.string().trim().max(5000).nullable().optional() }).parse(req.body);
    const access = await assessmentAccess(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Assessment not found." } });
    const attempt = await getPrisma().assessmentAttempt.findFirst({ where: { id: req.params.attemptId, assignment: { assessmentId: access.assessment.id }, status: { in: ["SUBMITTED", "GRADED", "EXPIRED"] } } });
    if (!attempt) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Completed attempt not found." } });
    const review = await getPrisma().assessmentReview.upsert({ where: { assessmentId_attemptId: { assessmentId: access.assessment.id, attemptId: attempt.id } }, update: input, create: { ...input, assessmentId: access.assessment.id, attemptId: attempt.id, reviewerId: req.auth.sub } });
    res.json({ data: review });
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
router.patch("/companies/:id", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access || !["OWNER", "HIRING_MANAGER"].includes(access.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Company owner or hiring manager access is required." } });
    const input = companySchema.partial().parse(req.body);
    res.json({ data: await getPrisma().company.update({ where: { id: req.params.id }, data: input, include: { members: true, verifications: { orderBy: { submittedAt: "desc" }, take: 1 } } }) });
  } catch (error) { next(error); }
});
router.post("/companies/:id/logo", logoUpload.single("file"), async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found." } });
    if (access.role !== "OWNER") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only company owners can upload a logo." } });
    if (!req.file || !LOGO_SIGNATURES[req.file.mimetype]?.(req.file.buffer)) return res.status(400).json({ error: { code: "INVALID_FILE", message: "A real PNG, JPG, or WebP logo up to 2 MB is required." } });
    const fileId = crypto.randomUUID();
    const objectKey = `company-logos/${req.params.id}/${fileId}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storedObject = await storage.put(objectKey, req.file.buffer);
    const stored = await getPrisma().storedFile.create({ data: { id: fileId, ownerUserId: req.auth.sub, objectKey, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, sha256: storedObject.sha256, retentionClass: "MODERATION_EVIDENCE", scanStatus: "PENDING" } });
    const logoUrl = `/api/v1/recruiter/companies/${req.params.id}/logo/${stored.id}`;
    const company = await getPrisma().company.update({ where: { id: req.params.id }, data: { logoUrl } });
    res.status(201).json({ data: { company, file: stored } });
  } catch (error) { next(error); }
});
router.get("/companies/:id/logo/:fileId", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found." } });
    const file = await getPrisma().storedFile.findFirst({ where: { id: req.params.fileId, objectKey: { startsWith: `company-logos/${req.params.id}/` }, scanStatus: "CLEAN", deletedAt: null } });
    if (!file) return res.status(404).json({ error: { code: "FILE_NOT_AVAILABLE", message: "Logo is unavailable until scanning is complete." } });
    res.type(file.mimeType).send(await storage.get(file.objectKey));
  } catch (error) { next(error); }
});
router.get("/companies/:id/members", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Company not found." } });
    const members = await getPrisma().companyMember.findMany({ where: { companyId: req.params.id }, include: { user: { select: { id: true, fullName: true, email: true, role: true, status: true } } }, orderBy: { invitedAt: "asc" } });
    res.json({ data: members });
  } catch (error) { next(error); }
});
router.post("/companies/:id/members", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access || access.role !== "OWNER") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only company owners can invite members." } });
    const input = z.object({ email: z.string().trim().toLowerCase().email().max(320), role: z.enum(["HIRING_MANAGER", "REVIEWER", "INTERVIEWER", "ANALYST"]) }).parse(req.body);
    const user = await getPrisma().user.findUnique({ where: { emailNormalized: input.email }, select: { id: true, role: true, status: true } });
    if (!user || user.role !== "RECRUITER" || user.status !== "ACTIVE") return res.status(404).json({ error: { code: "MEMBER_NOT_FOUND", message: "The recruiter account must exist and be active." } });
    const membership = await getPrisma().companyMember.upsert({
      where: { companyId_userId: { companyId: req.params.id, userId: user.id } },
      update: { role: input.role, active: true, acceptedAt: new Date(), invitedByUserId: req.auth.sub, deactivatedAt: null },
      create: { companyId: req.params.id, userId: user.id, role: input.role, active: true, invitedByUserId: req.auth.sub, acceptedAt: new Date() },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    await createNotification({ userId: user.id, type: "SYSTEM", title: "Company membership granted", body: `You have been added to the company team as ${input.role.toLowerCase().replaceAll("_", " ")}.`, resourceType: "COMPANY", resourceId: req.params.id }).catch(() => null);
    res.status(201).json({ data: membership });
  } catch (error) { next(error); }
});
router.patch("/companies/:id/members/:memberId", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access || access.role !== "OWNER") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only company owners can change memberships." } });
    const input = z.object({ role: z.enum(["OWNER", "HIRING_MANAGER", "REVIEWER", "INTERVIEWER", "ANALYST"]), active: z.boolean().optional() }).parse(req.body);
    const membership = await getPrisma().companyMember.findFirst({ where: { id: req.params.memberId, companyId: req.params.id } });
    if (!membership) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Membership not found." } });
    if (membership.role === "OWNER" && membership.userId === req.auth.sub && input.role !== "OWNER") return res.status(409).json({ error: { code: "LAST_OWNER", message: "You cannot remove your own owner role." } });
    res.json({ data: await getPrisma().companyMember.update({ where: { id: membership.id }, data: { role: input.role, ...(input.active === undefined ? {} : { active: input.active, deactivatedAt: input.active ? null : new Date() }) } }) });
  } catch (error) { next(error); }
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
    const applicationWhere = { job: { companyId: { in: companyIds } } };
    const [
      activeJobs,
      jobs,
      applications,
      newApplications,
      shortlisted,
      scheduledInterviews,
      completedInterviews,
      pendingAssessments,
      offersReleased,
      hires,
      recentApplications,
      recentStageChanges,
      applicationsByStatus,
      applicationTrend,
    ] = await Promise.all([
      getPrisma().job.count({ where: { companyId: { in: companyIds }, status: "PUBLISHED" } }),
      getPrisma().job.count({ where: { companyId: { in: companyIds } } }),
      getPrisma().application.count({ where: applicationWhere }),
      getPrisma().application.count({ where: { ...applicationWhere, status: "APPLIED", appliedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      getPrisma().application.count({ where: { ...applicationWhere, status: "SHORTLISTED" } }),
      getPrisma().recruiterInterview.count({ where: { companyId: { in: companyIds }, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
      getPrisma().recruiterInterview.count({ where: { companyId: { in: companyIds }, status: "COMPLETED" } }),
      getPrisma().assessmentAssignment.count({ where: { assessment: { ownerCompanyId: { in: companyIds } }, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
      getPrisma().offer.count({ where: { application: { job: { companyId: { in: companyIds } } }, status: "SENT" } }),
      getPrisma().application.count({ where: { ...applicationWhere, status: "HIRED" } }),
      getPrisma().application.findMany({ where: applicationWhere, include: { job: { select: { title: true, company: { select: { name: true } } } }, student: { select: { fullName: true, email: true } } }, orderBy: { appliedAt: "desc" }, take: 8 }),
      getPrisma().applicationStageHistory.findMany({ where: { application: applicationWhere }, include: { application: { include: { job: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 8 }),
      getPrisma().application.groupBy({ by: ["status"], where: applicationWhere, _count: { _all: true } }),
      getPrisma().application.findMany({ where: { ...applicationWhere, appliedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, select: { appliedAt: true } }),
    ]);
    const trend = [];
    for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      trend.push({ date: key, count: applicationTrend.filter((item) => item.appliedAt.toISOString().slice(0, 10) === key).length });
    }
    const ownerMemberships = await getPrisma().companyMember.count({ where: { companyId: { in: companyIds }, active: true } });
    res.json({
      data: {
        companies: companyIds.length,
        activeJobs,
        applications,
        newApplications,
        shortlisted,
        scheduledInterviews,
        completedInterviews,
        pendingAssessments,
        offersReleased,
        hires,
        recentApplications,
        recentActivity: recentStageChanges,
        applicationsByStatus: applicationsByStatus.map((item) => ({ status: item.status, count: item._count._all })),
        applicationTrend: trend,
        onboarding: { company: companyIds.length > 0, job: jobs > 0, teammate: ownerMemberships > companyIds.length, applicants: applications > 0 },
      },
    });
  } catch (error) { next(error); }
});

function dayRange(date = new Date()) {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      return { start, end };
    }
function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

router.get("/dashboard/summary", async (req, res, next) => {
      try {
        const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
        const companyIds = companies.map(({ id }) => id);
        const today = dayRange();
        const weekStart = new Date(today.start); weekStart.setDate(weekStart.getDate() - 7);
        const previousStart = new Date(weekStart); previousStart.setDate(previousStart.getDate() - 7);
        const base = { job: { companyId: { in: companyIds } } };
        const companyKey = companyIds.slice().sort().join(",");
        const data = await cached(`recruiter:dashboard-summary:${companyKey}:${today.start.toISOString().slice(0, 10)}:all`, async () => {
          const [openJobs, openJobsPrevious, newApplicants, previousApplicants, interviewsToday, interviewsNext7, offersAwaiting, expiringOffers, applications, pipeline, upcoming, stageChanges, newApplications, offerResponses, jobs, members, assessmentsAwaitingReview] = await Promise.all([
            getPrisma().job.count({ where: { companyId: { in: companyIds }, status: { in: ["DRAFT", "PUBLISHED", "PAUSED"] } } }),
            getPrisma().job.count({ where: { companyId: { in: companyIds }, status: { in: ["DRAFT", "PUBLISHED", "PAUSED"] }, createdAt: { lt: weekStart } } }),
            getPrisma().application.count({ where: { ...base, appliedAt: { gte: weekStart, lt: today.end } } }),
            getPrisma().application.count({ where: { ...base, appliedAt: { gte: previousStart, lt: weekStart } } }),
            getPrisma().recruiterInterview.findMany({ where: { companyId: { in: companyIds }, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledStart: { gte: today.start, lt: today.end } }, include: { application: { include: { job: true, student: { select: { fullName: true, email: true } } } } }, orderBy: { scheduledStart: "asc" } }),
            getPrisma().recruiterInterview.findMany({ where: { companyId: { in: companyIds }, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledStart: { gte: today.end, lt: new Date(today.end.getTime() + 7 * 86400000) } }, include: { application: { include: { job: true, student: { select: { fullName: true, email: true } } } } }, orderBy: { scheduledStart: "asc" }, take: 20 }),
            getPrisma().offer.count({ where: { job: { companyId: { in: companyIds } }, status: "SENT" } }),
            getPrisma().offer.findMany({ where: { job: { companyId: { in: companyIds } }, status: "SENT", expiresAt: { gte: today.start, lte: new Date(today.end.getTime() + 3 * 86400000) } }, include: { job: true, application: { include: { student: { select: { fullName: true, email: true } } } } }, orderBy: { expiresAt: "asc" }, take: 20 }),
            getPrisma().application.findMany({ where: base, select: { id: true, status: true, appliedAt: true, job: { select: { id: true, title: true } } } }),
            getPrisma().application.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
            getPrisma().recruiterInterview.findMany({ where: { companyId: { in: companyIds }, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledStart: { gte: today.start, lt: new Date(today.end.getTime() + 7 * 86400000) } }, include: { application: { include: { job: true, student: { select: { fullName: true, email: true } } } } }, orderBy: { scheduledStart: "asc" }, take: 20 }),
            getPrisma().applicationStageHistory.findMany({ where: { application: base, createdAt: { gte: weekStart } }, include: { application: { include: { job: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 20 }),
            getPrisma().application.findMany({ where: { ...base, appliedAt: { gte: weekStart } }, include: { job: { select: { title: true } }, student: { select: { fullName: true, email: true } } }, orderBy: { appliedAt: "desc" }, take: 20 }),
            getPrisma().offer.findMany({ where: { job: { companyId: { in: companyIds } }, respondedAt: { gte: weekStart } }, include: { job: { select: { title: true } } }, orderBy: { respondedAt: "desc" }, take: 20 }),
            getPrisma().job.count({ where: { companyId: { in: companyIds } } }),
            getPrisma().companyMember.count({ where: { companyId: { in: companyIds }, active: true } }),
            getPrisma().assessmentAssignment.findMany({ where: { assessment: { ownerCompanyId: { in: companyIds } }, status: "SUBMITTED" }, include: { assessment: { select: { id: true, title: true } }, student: { select: { id: true, fullName: true, email: true } } }, orderBy: { updatedAt: "asc" }, take: 20 }),
          ]);
          return {
            kpis: { openJobs, newApplicants, interviewsToday: interviewsToday.length, offersAwaitingResponse: offersAwaiting, trends: { openJobs: openJobs - openJobsPrevious, newApplicants: newApplicants - previousApplicants } },
            actionRequired: { applicationsAwaitingReview: applications.filter((item) => item.status === "APPLIED"), assessmentsAwaitingReview, interviews: [...interviewsToday, ...interviewsNext7], offersExpiring: expiringOffers },
            pipeline: pipeline.map((item) => ({ stage: item.status, count: item._count._all })),
            upcomingInterviews: upcoming,
            recentActivity: [...stageChanges.map((item) => ({ type: "stage_change", id: item.id, title: item.toStatus, detail: item.application.job.title, createdAt: item.createdAt })), ...newApplications.map((item) => ({ type: "new_application", id: item.id, title: "New application", detail: `${item.student.fullName || item.student.email} · ${item.job.title}`, createdAt: item.appliedAt })), ...offerResponses.map((item) => ({ type: "offer_response", id: item.id, title: `Offer ${item.status.toLowerCase()}`, detail: item.job.title, createdAt: item.respondedAt }))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20),
            onboarding: { company: companyIds.length > 0, job: jobs > 0, teammate: members > companyIds.length, applicants: applications.length > 0 },
          };
        });
        res.json({ data });
      } catch (error) { next(error); }
    });

router.get("/analytics", async (req, res, next) => {
      try {
        const parsed = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), jobId: z.string().uuid().optional(), format: z.enum(["json", "csv"]).default("json") }).parse(req.query);
        const to = parsed.to || new Date();
        const from = parsed.from || new Date(to.getTime() - 30 * 86400000);
        if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) return res.status(400).json({ error: { code: "INVALID_DATE_RANGE", message: "Choose valid dates.", details: [{ path: "from/to", message: "Enter valid ISO dates." }] } });
        if (from > to) return res.status(400).json({ error: { code: "INVALID_DATE_RANGE", message: "The start date must be before the end date.", details: [{ path: "from", message: "Must be before to." }, { path: "to", message: "Must be after from." }] } });
        if (to - from > 366 * 86400000) return res.status(400).json({ error: { code: "INVALID_DATE_RANGE", message: "Choose a valid date range of no more than one year.", details: [{ path: "to", message: "Range must be no more than one year." }] } });
        const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
        const companyIds = companies.map(({ id }) => id);
        if (parsed.jobId && !await getPrisma().job.findFirst({ where: { id: parsed.jobId, companyId: { in: companyIds } }, select: { id: true } })) return res.json({ data: emptyAnalytics(from, to) });
        const companyKey = companyIds.slice().sort().join(",");
        const data = await cached(`recruiter:analytics:${companyKey}:${from.toISOString()}:${to.toISOString()}:${parsed.jobId || "all"}`, async () => buildAnalytics({ from, to, jobId: parsed.jobId, companyIds }));
        if (parsed.format === "csv") {
          const rows = data.perJob.map((row) => [row.jobTitle, row.applicants, row.shortlisted, row.hired]);
          await getPrisma().auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: "RECRUITER_ANALYTICS_CSV_EXPORT", resourceType: "RECRUITER_ANALYTICS", requestId: req.requestId || crypto.randomUUID(), after: { rowCount: rows.length, from, to, jobId: parsed.jobId || null } } });
          return res.type("text/csv").send([["Job", "Applicants", "Shortlisted", "Hired"], ...rows].map((row) => row.map(csvCell).join(",")).join("\n"));
        }
        res.json({ data });
      } catch (error) { next(error); }
    });

function emptyAnalytics(from, to) {
      return { from, to, funnel: [], perJob: [], scoreDistribution: [], topSources: [], metrics: { timeToHireDays: null, offerAcceptanceRate: null, assessmentPassRate: null, interviewToOfferRatio: null } };
    }
async function buildAnalytics({ from, to, jobId, companyIds }) {
      const prisma = getPrisma();
      const jobWhere = { companyId: { in: companyIds }, ...(jobId ? { id: jobId } : {}) };
      const applications = await prisma.application.findMany({ where: { job: jobWhere, appliedAt: { gte: from, lte: to } }, include: { job: { select: { id: true, title: true } }, stageHistory: { orderBy: { createdAt: "asc" } } } });
      const histories = applications.flatMap((item) => item.stageHistory);
      const stages = ["APPLIED", "SCREENING", "SHORTLISTED", "ASSESSMENT", "TECHNICAL_INTERVIEW", "HR_INTERVIEW", "SELECTED", "OFFER_RELEASED", "HIRED", "REJECTED"];
      const funnel = stages.map((stage, index) => {
        const count = applications.filter((item) => item.stageHistory.some((history) => history.toStatus === stage) || item.status === stage).length;
        const previous = index ? applications.filter((item) => item.stageHistory.some((history) => history.toStatus === stages[index - 1]) || item.status === stages[index - 1]).length : applications.length;
        return { stage, count, conversionRate: previous ? Math.round((count / previous) * 1000) / 10 : null, averageDays: averageStageDays(applications, stage) };
      });
      const offers = await prisma.offer.findMany({ where: { job: jobWhere, createdAt: { gte: from, lte: to } }, select: { status: true, respondedAt: true } });
      const interviews = await prisma.recruiterInterview.count({ where: { companyId: { in: companyIds }, ...(jobId ? { application: { jobId } } : {}), createdAt: { gte: from, lte: to } } });
      const attempts = await prisma.assessmentAttempt.findMany({ where: { assignment: { job: jobWhere }, submittedAt: { gte: from, lte: to } }, select: { score: true } });
      const perJob = [...new Map(applications.map((item) => [item.job.id, item.job])).values()].map((job) => {
        const rows = applications.filter((item) => item.job.id === job.id);
        return { jobId: job.id, jobTitle: job.title, applicants: rows.length, shortlisted: rows.filter((item) => ["SHORTLISTED", "ASSESSMENT", "TECHNICAL_INTERVIEW", "HR_INTERVIEW", "SELECTED", "OFFER_RELEASED", "HIRED"].includes(item.status)).length, hired: rows.filter((item) => item.status === "HIRED").length };
      });
      return {
        from, to, funnel, perJob, topSources: [], scoreDistribution: scoreBuckets(attempts.map((item) => Number(item.score)).filter(Number.isFinite)),
        metrics: { timeToHireDays: averageHireDays(applications), offerAcceptanceRate: offers.length ? Math.round((offers.filter((item) => item.status === "ACCEPTED").length / offers.length) * 1000) / 10 : null, assessmentPassRate: attempts.length ? Math.round((attempts.filter((item) => Number(item.score) >= 60).length / attempts.length) * 1000) / 10 : null, interviewToOfferRatio: interviews ? Math.round((offers.length / interviews) * 1000) / 10 : null },
        rowCount: applications.length, historyCount: histories.length,
      };
    }
function averageStageDays(applications, stage) {
      const values = applications.map((item) => { const entry = item.stageHistory.find((history) => history.toStatus === stage); const next = item.stageHistory.find((history) => history.createdAt > entry?.createdAt); return entry && next ? (next.createdAt - entry.createdAt) / 86400000 : null; }).filter(Boolean);
      return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    }
function averageHireDays(applications) {
      const values = applications.map((item) => { const hired = item.stageHistory.find((history) => history.toStatus === "HIRED"); return hired ? (hired.createdAt - item.appliedAt) / 86400000 : null; }).filter(Boolean);
      return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    }
function scoreBuckets(scores) {
      return ["0-59", "60-79", "80-100"].map((range) => ({ range, count: scores.filter((score) => range === "0-59" ? score < 60 : range === "60-79" ? score < 80 : score <= 100).length })).filter((item) => item.count > 0);
    }
module.exports = router;
module.exports.isAuthorizedCompanyMember = isAuthorizedCompanyMember;
module.exports.resetAnalyticsRedis = resetAnalyticsRedis;
module.exports.invalidateRecruiterCache = invalidateRecruiterCache;
