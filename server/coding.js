"use strict";

const crypto = require("node:crypto");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { enqueueCodingRun, enqueueCodingSubmission } = require("./coding-queue");
const { configuration: judge0Configuration } = require("./judge0");

const languages = ["Java", "C++", "Python", "JavaScript"];
const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  topic: z.string().trim().max(120).optional(),
  status: z.enum(["Solved", "Attempted", "Unsolved"]).optional(),
  sort: z.enum(["title", "difficulty"]).default("title"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

function db() {
  return getPrisma();
}

function problemIdentifierWhere(identifier) {
  return z.string().uuid().safeParse(identifier).success
    ? { id: identifier }
    : { slug: identifier };
}

function publicProblem(problem, progress) {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    difficulty: problem.difficulty,
    topics: problem.topics.map(({ topic }) => topic.name),
    languages: problem.languageConfigs.filter((config) => config.enabled).map(({ language }) => language),
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
    status: progress?.status || "UNSOLVED",
    attempts: progress?.attempts || 0,
    solvedAt: progress?.solvedAt || null,
  };
}

async function studentId(userId) {
  const profile = await db().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "STUDENT_PROFILE_NOT_FOUND" });
  return profile.id;
}

function parseSource(body) {
  return z.object({
    problemId: z.string().uuid(),
    language: z.enum(languages),
    sourceCode: z.string().min(1).max(50_000),
    customInput: z.string().max(10_000).nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  }).parse(body);
}

async function listProblems(req, res, next) {
  try {
    const input = listSchema.parse(req.query);
    const where = {
      status: "PUBLISHED",
      ...(input.search ? { OR: [{ title: { contains: input.search, mode: "insensitive" } }, { statement: { contains: input.search, mode: "insensitive" } }] } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.topic ? { topics: { some: { topic: { name: { equals: input.topic, mode: "insensitive" } } } } } : {}),
      ...(input.status === "Unsolved" ? { progress: { none: { userId: req.auth.sub } } } : {}),
      ...(input.status && input.status !== "Unsolved" ? { progress: { some: { userId: req.auth.sub, status: input.status.toUpperCase() } } } : {}),
    };
    const prisma = db();
    const [total, problems, profile] = await prisma.$transaction([
      prisma.codingProblem.count({ where }),
      prisma.codingProblem.findMany({
        where,
        include: { topics: { include: { topic: true } }, languageConfigs: { where: { enabled: true } } },
        orderBy: input.sort === "difficulty" ? [{ difficulty: "asc" }, { title: "asc" }] : { title: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.user.findUnique({ where: { id: req.auth.sub }, select: { codingProgress: { select: { problemId: true, status: true, attempts: true, solvedAt: true } } } }),
    ]);
    const progress = new Map((profile?.codingProgress || []).map((item) => [item.problemId, item]));
    res.json({ data: { items: problems.map((problem) => publicProblem(problem, progress.get(problem.id))), page: input.page, pageSize: input.pageSize, total, pages: Math.ceil(total / input.pageSize) } });
  } catch (error) { next(error); }
}

async function getProblem(req, res, next) {
  try {
    const problem = await db().codingProblem.findFirst({
      where: { ...problemIdentifierWhere(req.params.id), status: "PUBLISHED" },
      include: { topics: { include: { topic: true } }, languageConfigs: { where: { enabled: true } }, testCases: { where: { kind: "PUBLIC", enabled: true }, orderBy: { sequence: "asc" }, select: { id: true, sequence: true } } },
    });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Problem not found." } });
    const progress = await db().studentProblemProgress.findUnique({ where: { userId_problemId: { userId: req.auth.sub, problemId: problem.id } } });
    res.json({ data: { ...publicProblem(problem, progress), inputFormat: problem.inputFormat || null, outputFormat: problem.outputFormat || null, constraints: problem.constraints || [], examples: problem.examples || [], explanation: problem.explanation || null, testCaseCount: problem.testCases.length } });
  } catch (error) { next(error); }
}

async function starterCode(req, res, next) {
  try {
    const input = z.object({ language: z.enum(languages) }).parse(req.query);
    const config = await db().problemLanguageConfig.findFirst({ where: { problem: { ...problemIdentifierWhere(req.params.id), status: "PUBLISHED" }, language: input.language, enabled: true }, select: { language: true, starterCode: true, functionSignature: true } });
    if (!config) return res.status(404).json({ error: { code: "LANGUAGE_NOT_SUPPORTED", message: "That language is not enabled for this problem." } });
    res.json({ data: config });
  } catch (error) { next(error); }
}

async function createRun(req, res, next) {
  try {
    const input = parseSource(req.body);
    judge0Configuration();
    const problem = await db().codingProblem.findFirst({ where: { id: input.problemId, status: "PUBLISHED", languageConfigs: { some: { language: input.language, enabled: true } } }, select: { id: true } });
    if (!problem) return res.status(404).json({ error: { code: "PROBLEM_NOT_AVAILABLE", message: "Problem or language is not available." } });
    const run = await db().codeRun.create({ data: { userId: req.auth.sub, problemId: problem.id, language: input.language, sourceCode: input.sourceCode, customInput: input.customInput || null, status: "QUEUED", provider: "judge0" } });
    try { await enqueueCodingRun(run.id); } catch (error) {
      await db().codeRun.update({ where: { id: run.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", stderr: error.message, completedAt: new Date() } });
      return res.status(503).json({ error: { code: error.code || "CODING_QUEUE_UNAVAILABLE", message: "Coding execution is temporarily unavailable. Please try again later." } });
    }
    res.status(202).json({ data: { id: run.id, status: run.status, provider: run.provider, message: "Queued for Judge0 execution." } });
  } catch (error) { next(error); }
}

async function createSubmission(req, res, next) {
  try {
    const input = parseSource(req.body);
    judge0Configuration();
    const prisma = db();
    const problem = await prisma.codingProblem.findFirst({ where: { id: input.problemId, status: "PUBLISHED", languageConfigs: { some: { language: input.language, enabled: true } } }, select: { id: true } });
    if (!problem) return res.status(404).json({ error: { code: "PROBLEM_NOT_AVAILABLE", message: "Problem or language is not available." } });
    const sourceHash = crypto.createHash("sha256").update(input.sourceCode).digest("hex");
    const submission = await prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.codeSubmission.findUnique({ where: { userId_idempotencyKey: { userId: req.auth.sub, idempotencyKey: input.idempotencyKey } } });
        if (existing) return existing;
      }
      const created = await tx.codeSubmission.create({ data: { userId: req.auth.sub, problemId: problem.id, type: "PRACTICE", language: input.language, sourceCode: input.sourceCode, sourceHash, idempotencyKey: input.idempotencyKey || null, status: "QUEUED", policyVersion: "phase4-v1", queuedAt: new Date() } });
      await tx.submissionStatusHistory.create({ data: { submissionId: created.id, toStatus: "QUEUED" } });
      await tx.studentProblemProgress.upsert({ where: { userId_problemId: { userId: req.auth.sub, problemId: problem.id } }, create: { userId: req.auth.sub, problemId: problem.id, status: "ATTEMPTED", attempts: 1, lastSubmittedAt: new Date() }, update: { status: "ATTEMPTED", attempts: { increment: 1 }, lastSubmittedAt: new Date() } });
      return created;
    });
    try { await enqueueCodingSubmission(submission.id); } catch (error) {
      await prisma.$transaction(async (tx) => {
        await tx.codeSubmission.update({ where: { id: submission.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", completedAt: new Date() } });
        await tx.submissionStatusHistory.create({ data: { submissionId: submission.id, fromStatus: submission.status, toStatus: "FAILED", note: error.message.slice(0, 500) } });
      });
      return res.status(503).json({ error: { code: error.code || "CODING_QUEUE_UNAVAILABLE", message: "Coding execution is temporarily unavailable. Please try again later." } });
    }
    res.status(202).json({ data: { id: submission.id, status: submission.status, verdict: submission.verdict } });
  } catch (error) { next(error); }
}

async function getRun(req, res, next) {
  try {
    const run = await db().codeRun.findFirst({ where: { id: req.params.id, userId: req.auth.sub }, select: { id: true, status: true, verdict: true, provider: true, executionTimeMs: true, memoryKb: true, stdout: true, stderr: true, compileOutput: true, createdAt: true, completedAt: true } });
    if (!run) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found." } });
    res.json({ data: run });
  } catch (error) { next(error); }
}

function safeExecutionResult(result) {
  const summary = Array.isArray(result.perTestSummary) ? { tests: result.perTestSummary } : result.perTestSummary || {};
  return {
    id: result.id,
    provider: result.provider,
    passedTests: result.passedTests,
    totalTests: result.totalTests,
    executionTimeMs: result.executionTimeMs,
    memoryKb: result.memoryKb,
    failureCode: result.failureCode,
    perTestSummary: Array.isArray(summary.tests) ? summary.tests.map(({ sequence, kind, passed, verdict, executionTimeMs, memoryKb }) => ({ sequence, kind, passed, verdict, executionTimeMs, memoryKb })) : [],
    ...(summary.publicFeedback ? { stdout: summary.publicFeedback.stdout || "", stderr: summary.publicFeedback.stderr || "", compileOutput: summary.publicFeedback.compileOutput || "" } : {}),
    createdAt: result.createdAt,
  };
}

function safeSubmissionHistoryItem(item) {
  return {
    id: item.id,
    language: item.language,
    status: item.status,
    verdict: item.verdict,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    problem: item.problem,
  };
}

async function getSubmission(req, res, next) {
  try {
    const submission = await db().codeSubmission.findFirst({ where: { id: req.params.id, userId: req.auth.sub }, include: { executionResults: { orderBy: { createdAt: "desc" }, take: 1 }, problem: { select: { title: true, slug: true } } } });
    if (!submission) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Submission not found." } });
    res.json({ data: { id: submission.id, language: submission.language, status: submission.status, verdict: submission.verdict, attemptCount: submission.attemptCount, queuedAt: submission.queuedAt, startedAt: submission.startedAt, completedAt: submission.completedAt, createdAt: submission.createdAt, problem: submission.problem, executionResults: submission.executionResults.map(safeExecutionResult) } });
  } catch (error) { next(error); }
}

async function history(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const where = { userId: req.auth.sub };
    const [total, items] = await db().$transaction([
      db().codeSubmission.count({ where }),
      db().codeSubmission.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, language: true, status: true, verdict: true, createdAt: true, completedAt: true, problem: { select: { id: true, slug: true, title: true, difficulty: true } } } }),
    ]);
    res.json({ data: { items: items.map(safeSubmissionHistoryItem), page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { next(error); }
}

async function stats(req, res, next) {
  try {
    const items = await db().studentProblemProgress.findMany({ where: { userId: req.auth.sub }, include: { problem: { select: { difficulty: true } } } });
    const submissions = await db().codeSubmission.count({ where: { userId: req.auth.sub } });
    const solved = items.filter((item) => item.status === "SOLVED");
    const byDifficulty = Object.fromEntries(["Easy", "Medium", "Hard"].map((difficulty) => [difficulty, solved.filter((item) => item.problem.difficulty === difficulty).length]));
    res.json({ data: { totalSolved: solved.length, totalSubmissions: submissions, acceptanceRate: submissions ? Math.round((solved.length / submissions) * 100) : 0, byDifficulty } });
  } catch (error) { next(error); }
}

module.exports = { listProblems, getProblem, starterCode, createRun, createSubmission, getRun, getSubmission, history, stats, languages, problemIdentifierWhere, safeExecutionResult, safeSubmissionHistoryItem };
