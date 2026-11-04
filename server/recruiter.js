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
