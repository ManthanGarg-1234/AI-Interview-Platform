"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { enqueueCodingSubmission } = require("./coding-queue");

const languages = ["Java", "C++", "Python", "JavaScript"];
const router = express.Router();
const adminRouter = express.Router();
const contestInput = z.object({
  title: z.string().trim().min(3).max(240),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/).max(180),
  description: z.string().trim().max(10000).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  maxSubmissionsPerProblem: z.coerce.number().int().min(1).max(100).default(3),
  allowedLanguages: z.array(z.enum(languages)).min(1).default(languages),
}).refine((value) => value.endsAt > value.startsAt, { message: "Contest end must be after its start." });

function fail(message, code, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
function contestPhase(contest, now = new Date()) {
  if (now < contest.startsAt) return "UPCOMING";
  if (now >= contest.endsAt) return "ENDED";
  return "LIVE";
}
function assertWindow(contest, now = new Date()) {
  const phase = contestPhase(contest, now);
  if (contest.status !== "PUBLISHED" && contest.status !== "LIVE") fail("This contest is not accepting submissions.", "CONTEST_NOT_PUBLISHED", 409);
  if (phase === "UPCOMING") fail("The contest has not started yet.", "CONTEST_NOT_STARTED", 409);
  if (phase === "ENDED") fail("The contest has ended.", "CONTEST_ENDED", 409);
}
function publicContest(contest) {
  return { id: contest.id, title: contest.title, slug: contest.slug, description: contest.description, status: contest.status, startsAt: contest.startsAt, endsAt: contest.endsAt, phase: contestPhase(contest), problemCount: contest.problems?.length ?? contest._count?.problems ?? 0 };
}
function scoreFor(problem, wrongAttempts) {
  return Math.max(0, problem.points - (problem.penaltyPerWrong * wrongAttempts));
}

router.get("/", async (req, res, next) => {
  try {
    const contests = await getPrisma().contest.findMany({
      where: { status: { in: ["PUBLISHED", "LIVE", "ENDED"] } },
      include: {
        problems: true,
        registrations: { where: { userId: req.auth.sub }, select: { id: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    res.json({ data: contests.map((contest) => ({ ...publicContest(contest), registered: contest.registrations.length > 0 })) });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const contest = await getPrisma().contest.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }], status: { in: ["PUBLISHED", "LIVE", "ENDED"] } }, include: { problems: { include: { problem: { select: { id: true, slug: true, title: true, statement: true, difficulty: true, languageConfigs: { where: { enabled: true }, select: { language: true, starterCode: true, functionSignature: true } } } } }, orderBy: { sequence: "asc" } } } });
    if (!contest) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    res.json({ data: { ...publicContest(contest), problems: contest.problems.map((item) => ({ id: item.id, points: item.points, sequence: item.sequence, problem: item.problem })) } });
  } catch (error) { next(error); }
});

router.post("/:id/register", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const contest = await prisma.contest.findFirst({ where: { id: req.params.id, status: { in: ["PUBLISHED", "LIVE"] } } });
    if (!contest) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    if (new Date() >= contest.endsAt) fail("Registration is closed.", "CONTEST_ENDED", 409);
    const registration = await prisma.contestRegistration.upsert({ where: { contestId_userId: { contestId: contest.id, userId: req.auth.sub } }, update: {}, create: { contestId: contest.id, userId: req.auth.sub } });
    res.status(201).json({ data: registration });
  } catch (error) { next(error); }
});

router.get("/:id/workspace", async (req, res, next) => {
  try {
    const contest = await getPrisma().contest.findUnique({ where: { id: req.params.id }, include: { problems: { include: { problem: { select: { id: true, slug: true, title: true, statement: true, difficulty: true, languageConfigs: { where: { enabled: true }, select: { language: true, starterCode: true, functionSignature: true } } } } }, orderBy: { sequence: "asc" } } } });
    if (!contest) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    const registration = await getPrisma().contestRegistration.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: req.auth.sub } } });
    if (!registration) fail("Register for the contest before opening the workspace.", "CONTEST_REGISTRATION_REQUIRED", 403);
    res.json({ data: { contest: publicContest(contest), problems: contest.problems.map((item) => ({ id: item.id, points: item.points, sequence: item.sequence, problem: item.problem })) } });
  } catch (error) { next(error); }
});

router.post("/:id/submissions", async (req, res, next) => {
  try {
    const input = z.object({ contestProblemId: z.string().uuid(), language: z.enum(languages), sourceCode: z.string().min(1).max(50000), idempotencyKey: z.string().trim().min(8).max(200).optional() }).parse(req.body);
    const prisma = getPrisma();
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    assertWindow(contest);
    const registered = await prisma.contestRegistration.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: req.auth.sub } } });
    if (!registered) fail("Registration is required.", "CONTEST_REGISTRATION_REQUIRED", 403);
    const problem = await prisma.contestProblem.findFirst({ where: { id: input.contestProblemId, contestId: contest.id }, include: { problem: { include: { languageConfigs: { where: { enabled: true }, select: { language: true } } } } } });
    if (!problem) fail("Contest problem not found.", "CONTEST_PROBLEM_NOT_FOUND", 404);
    const allowed = Array.isArray(contest.allowedLanguages) && contest.allowedLanguages.length ? contest.allowedLanguages : languages;
    if (!allowed.includes(input.language) || !problem.problem.languageConfigs.some((item) => item.language === input.language)) fail("This language is not allowed in the contest.", "LANGUAGE_NOT_ALLOWED", 400);
    const prior = await prisma.contestSubmission.findMany({ where: { contestId: contest.id, userId: req.auth.sub, problemId: problem.problemId }, include: { codeSubmission: { select: { sourceHash: true } } }, orderBy: { submittedAt: "desc" } });
    if (prior.some((item) => item.solved)) fail("This problem has already been solved.", "DUPLICATE_SOLVED_SUBMISSION", 409);
    if (prior.length >= contest.maxSubmissionsPerProblem) fail("Submission limit reached for this problem.", "SUBMISSION_LIMIT_REACHED", 429);
    const sourceHash = crypto.createHash("sha256").update(input.sourceCode).digest("hex");
    if (prior.some((item) => item.codeSubmission.sourceHash === sourceHash)) fail("Duplicate source submissions are not allowed.", "DUPLICATE_SUBMISSION", 409);
    const created = await prisma.$transaction(async (tx) => {
      const code = await tx.codeSubmission.create({ data: { userId: req.auth.sub, problemId: problem.problemId, contestId: contest.id, type: "CONTEST", language: input.language, sourceCode: input.sourceCode, sourceHash, idempotencyKey: input.idempotencyKey || null, status: "QUEUED", policyVersion: "contest-v1", queuedAt: new Date() } });
      const contestSubmission = await tx.contestSubmission.create({ data: { contestId: contest.id, userId: req.auth.sub, problemId: problem.problemId, codeSubmissionId: code.id, language: input.language, sourceHash } });
      return { code, contestSubmission };
    });
    try { await enqueueCodingSubmission(created.code.id); } catch (error) { await prisma.codeSubmission.update({ where: { id: created.code.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", completedAt: new Date() } }); throw error; }
    res.status(202).json({ data: { id: created.contestSubmission.id, codeSubmissionId: created.code.id, status: "QUEUED" } });
  } catch (error) { next(error); }
});

router.get("/:id/standings", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    if (contest.status !== "ENDED" && new Date() < contest.endsAt) {
      const registration = await prisma.contestRegistration.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: req.auth.sub } } });
      if (!registration && req.auth.role !== "ADMIN") fail("Standings are protected until you register or the contest ends.", "STANDINGS_PRIVATE", 403);
    }
    const rows = await prisma.contestSubmission.groupBy({ by: ["userId"], where: { contestId: contest.id, solved: true }, _sum: { score: true }, _count: { problemId: true } });
    res.json({ data: rows.sort((a, b) => (b._sum.score || 0) - (a._sum.score || 0)).map((row, index) => ({ rank: index + 1, score: row._sum.score || 0, solved: row._count.problemId, isCurrentUser: row.userId === req.auth.sub })) });
  } catch (error) { next(error); }
});

adminRouter.get("/", async (req, res, next) => {
  try { res.json({ data: await getPrisma().contest.findMany({ where: { organizerUserId: req.auth.role === "ADMIN" ? undefined : req.auth.sub }, include: { problems: true }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); }
});
adminRouter.post("/", async (req, res, next) => {
  try {
    const input = contestInput.parse(req.body);
    const contest = await getPrisma().contest.create({ data: { ...input, organizerUserId: req.auth.sub, allowedLanguages: input.allowedLanguages } });
    res.status(201).json({ data: contest });
  } catch (error) { next(error); }
});
adminRouter.patch("/:id", async (req, res, next) => {
  try {
    const existing = await getPrisma().contest.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.auth.role !== "ADMIN" && existing.organizerUserId !== req.auth.sub)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    const data = contestInput.partial().parse(req.body);
    const updated = await getPrisma().contest.update({ where: { id: existing.id }, data });
    res.json({ data: updated });
  } catch (error) { next(error); }
});
adminRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const existing = await getPrisma().contest.findUnique({ where: { id: req.params.id }, include: { problems: true } });
    if (!existing || (req.auth.role !== "ADMIN" && existing.organizerUserId !== req.auth.sub)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    if (!existing.problems.length) fail("A contest needs at least one problem before publication.", "CONTEST_REQUIRES_PROBLEMS", 400);
    const updated = await getPrisma().contest.update({ where: { id: existing.id }, data: { status: "PUBLISHED" } });
    res.json({ data: updated });
  } catch (error) { next(error); }
});
adminRouter.post("/:id/problems", async (req, res, next) => {
  try {
    const input = z.object({ problemId: z.string().uuid(), points: z.number().int().min(1).max(100000).default(100), penaltyPerWrong: z.number().int().min(0).max(100000).default(0), sequence: z.number().int().min(1).max(1000) }).parse(req.body);
    const contest = await getPrisma().contest.findUnique({ where: { id: req.params.id } });
    if (!contest || (req.auth.role !== "ADMIN" && contest.organizerUserId !== req.auth.sub)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Contest not found." } });
    res.status(201).json({ data: await getPrisma().contestProblem.create({ data: { contestId: contest.id, ...input } }) });
  } catch (error) { next(error); }
});

module.exports = { router, adminRouter, contestPhase, assertWindow, scoreFor };
