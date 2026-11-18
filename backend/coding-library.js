"use strict";

const express = require("express");
const { isIP } = require("node:net");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const problemStatuses = ["NOT_STARTED", "ATTEMPTED", "SOLVED", "REVISION_REQUIRED"];
const platforms = ["LEETCODE", "GFG", "CODE360", "HACKERRANK", "CODECHEF", "INTERVIEWBIT", "CODEFORCES", "OTHER"];
const studentRouter = express.Router();

const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
  sheet: z.string().trim().max(220).optional(),
  topic: z.string().trim().max(160).optional(),
  pattern: z.string().trim().max(180).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  platform: z.enum(platforms).optional(),
  progress: z.enum(problemStatuses).optional(),
  source: z.string().trim().max(160).optional(),
  company: z.string().trim().max(160).optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  bookmarked: z.preprocess((value) => value === true || value === "true" ? true : value === false || value === "false" ? false : value, z.boolean().optional()),
  recent: z.preprocess((value) => value === true || value === "true" ? true : value === false || value === "false" ? false : value, z.boolean().optional()),
  unsolved: z.preprocess((value) => value === true || value === "true" ? true : value === false || value === "false" ? false : value, z.boolean().optional()),
  sort: z.enum(["recommended", "title", "difficulty", "popular", "recent"]).default("recommended"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const sheetListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  platform: z.enum(platforms).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  source: z.string().trim().max(160).optional(),
  sort: z.enum(["name", "problemCount", "popularity"]).default("popularity"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const progressSchema = z.object({ status: z.enum(problemStatuses) });
const noteSchema = z.object({ note: z.string().max(5000) });

const hostByPlatform = {
  LEETCODE: ["leetcode.com"],
  GFG: ["geeksforgeeks.org"],
  CODE360: ["code360.in", "codingninjas.com"],
  HACKERRANK: ["hackerrank.com"],
  CODECHEF: ["codechef.com"],
  INTERVIEWBIT: ["interviewbit.com"],
  CODEFORCES: ["codeforces.com"],
};

function db() {
  return getPrisma();
}

function canonicalProblemWhere(filters, userId, sheetId) {
  const clauses = [{ status: "PUBLISHED", canonicalProblemId: null }];
  if (filters.search) {
    clauses.push({ OR: [
      { title: { contains: filters.search, mode: "insensitive" } },
      { summary: { contains: filters.search, mode: "insensitive" } },
      { slug: { contains: filters.search, mode: "insensitive" } },
    ] });
  }
  if (filters.difficulty) clauses.push({ difficulty: filters.difficulty });
  if (filters.platform) clauses.push({ platform: filters.platform });
  if (filters.sheet) clauses.push({ sheetAssociations: { some: { sheet: { slug: filters.sheet, status: "PUBLISHED" } } } });
  if (sheetId) clauses.push({ sheetAssociations: { some: { sheetId } } });
  if (filters.topic) clauses.push({ codingTopics: { some: { topic: { OR: [{ slug: filters.topic }, { name: { equals: filters.topic, mode: "insensitive" } }] } } } });
  if (filters.pattern) clauses.push({ patterns: { some: { pattern: { OR: [{ slug: filters.pattern }, { name: { equals: filters.pattern, mode: "insensitive" } }] } } } });
  if (filters.source) clauses.push({ sheetAssociations: { some: { sheet: { source: { contains: filters.source, mode: "insensitive" }, status: "PUBLISHED" } } } });
  if (filters.priority) clauses.push({ placementPriority: filters.priority });
  if (filters.company) clauses.push({ companies: { some: { companyName: { equals: filters.company, mode: "insensitive" }, verifiedAt: { not: null } } } });
  if (filters.bookmarked) clauses.push({ bookmarks: { some: { userId } } });
  if (filters.progress === "NOT_STARTED") {
    clauses.push({ OR: [
      { progress: { none: { userId } } },
      { progress: { some: { userId, status: "NOT_STARTED" } } },
    ] });
  } else if (filters.progress) {
    clauses.push({ progress: { some: { userId, status: filters.progress } } });
  }
  if (filters.unsolved) clauses.push({ progress: { none: { userId, status: "SOLVED" } } });
  if (filters.recent) clauses.push({ progress: { some: { userId, updatedAt: { gte: new Date(Date.now() - 30 * 86400000) } } } });
  return { AND: clauses };
}

function problemInclude(userId) {
  return {
    codingTopics: { include: { topic: { select: { id: true, slug: true, name: true } } } },
    patterns: { include: { pattern: { select: { id: true, slug: true, name: true } } } },
    sheetAssociations: {
      where: { sheet: { status: "PUBLISHED" } },
      orderBy: [{ sheet: { name: "asc" } }, { sequence: "asc" }],
      include: { sheet: { select: { id: true, slug: true, name: true } }, topic: { select: { name: true } } },
    },
    companies: { where: { verifiedAt: { not: null } }, select: { companyName: true, evidenceUrl: true, verifiedAt: true } },
    progress: { where: { userId }, select: { status: true, attempts: true, solvedAt: true, updatedAt: true } },
    bookmarks: { where: { userId }, select: { createdAt: true } },
    notes: { where: { userId }, select: { note: true, updatedAt: true } },
  };
}

function publicProblem(problem) {
  const progress = problem.progress[0] || null;
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    summary: problem.summary,
    subtopic: problem.subtopic,
    difficulty: problem.difficulty,
    platform: problem.platform,
    url: problem.url,
    attribution: problem.attribution,
    placementPriority: problem.placementPriority,
    estimatedMinutes: problem.estimatedMinutes,
    verifiedAt: problem.verifiedAt,
    topics: problem.codingTopics.map(({ topic }) => topic),
    patterns: problem.patterns.map(({ pattern }) => pattern),
    sheets: problem.sheetAssociations.map(({ sheet, topic }) => ({ ...sheet, topic: topic.name })),
    companies: problem.companies,
    progress: progress ? { ...progress, lastUpdatedAt: progress.updatedAt } : { status: "NOT_STARTED", attempts: 0, solvedAt: null, lastUpdatedAt: null },
    bookmarked: problem.bookmarks.length > 0,
    note: problem.notes[0]?.note || "",
  };
}

function summaryForSheet(sheet, userId) {
  const problems = sheet.problems;
  const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const topics = new Set();
  let solved = 0;
  let started = false;
  for (const association of problems) {
    const problem = association.problem;
    counts[problem.difficulty] = (counts[problem.difficulty] || 0) + 1;
    topics.add(association.topic.name);
    const progress = problem.progress.find((item) => item.userId === userId);
    if (progress?.status === "SOLVED") solved += 1;
    if (progress && progress.status !== "NOT_STARTED") started = true;
  }
  return {
    id: sheet.id,
    slug: sheet.slug,
    name: sheet.name,
    description: sheet.description,
    source: sheet.source,
    category: sheet.category,
    estimatedMinutes: sheet.estimatedMinutes,
    totalProblems: problems.length,
    difficultyCounts: counts,
    topicCount: topics.size,
    solved,
    completionPercent: problems.length ? Math.round((solved / problems.length) * 100) : 0,
    popularity: sheet._count.engagements,
    status: problems.length > 0 && solved === problems.length ? "COMPLETED" : started ? "IN_PROGRESS" : "NOT_STARTED",
  };
}

function problemOrder(sort) {
  if (sort === "title") return [{ title: "asc" }, { id: "asc" }];
  if (sort === "difficulty") return [{ difficulty: "asc" }, { title: "asc" }];
  if (sort === "popular") return [{ bookmarks: { _count: "desc" } }, { title: "asc" }];
  return [{ placementPriority: { sort: "asc", nulls: "last" } }, { title: "asc" }];
}

function sheetStateWhere(status, userId) {
  const unsolvedProblem = {
    status: "PUBLISHED",
    canonicalProblemId: null,
    OR: [
      { progress: { none: { userId } } },
      { progress: { some: { userId, status: { not: "SOLVED" } } } },
    ],
  };
  if (status === "COMPLETED") {
    return {
      AND: [
        { problems: { some: { problem: { status: "PUBLISHED", canonicalProblemId: null } } } },
        { problems: { none: { problem: unsolvedProblem } } },
      ],
    };
  }
  if (status === "IN_PROGRESS") {
    return {
      AND: [
        {
          problems: {
            some: {
              problem: {
                status: "PUBLISHED",
                canonicalProblemId: null,
                progress: { some: { userId, status: { in: ["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"] } } },
              },
            },
          },
        },
        { problems: { some: { problem: unsolvedProblem } } },
      ],
    };
  }
  return {
    problems: {
      none: {
        problem: { status: "PUBLISHED", canonicalProblemId: null, progress: { some: { userId, status: { in: ["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"] } } } },
      },
    },
  };
}

async function listSheets(req, res, next) {
  try {
    const input = sheetListSchema.parse(req.query);
    const prisma = db();
    const filters = { difficulty: input.difficulty, platform: input.platform };
    const matchingProblems = canonicalProblemWhere(filters, req.auth.sub);
    const where = {
      status: "PUBLISHED",
      ...(input.category ? { category: { equals: input.category, mode: "insensitive" } } : {}),
      ...(input.source ? { source: { contains: input.source, mode: "insensitive" } } : {}),
      ...(input.search ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { description: { contains: input.search, mode: "insensitive" } }] } : {}),
      ...(input.difficulty || input.platform ? { problems: { some: { problem: matchingProblems } } } : {}),
      ...(input.status ? sheetStateWhere(input.status, req.auth.sub) : {}),
    };
    const orderBy = input.sort === "name"
      ? [{ name: "asc" }]
      : input.sort === "problemCount"
        ? [{ problems: { _count: "desc" } }, { name: "asc" }]
        : [{ engagements: { _count: "desc" } }, { name: "asc" }];
    const [total, sheets] = await prisma.$transaction([
      prisma.sheet.count({ where }),
      prisma.sheet.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          _count: { select: { engagements: true } },
          problems: {
            where: { problem: { status: "PUBLISHED", canonicalProblemId: null } },
            orderBy: { sequence: "asc" },
            include: {
              topic: { select: { name: true } },
              problem: { select: { id: true, difficulty: true, progress: { where: { userId: req.auth.sub }, select: { userId: true, status: true } } } },
            },
          },
        },
      }),
    ]);
    const items = sheets.map((sheet) => summaryForSheet(sheet, req.auth.sub));
    res.json({ data: { items, page: input.page, pageSize: input.pageSize, total, pages: Math.ceil(total / input.pageSize) } });
  } catch (error) { next(error); }
}

async function getSheet(req, res, next) {
  try {
    const input = listSchema.omit({ sheet: true }).parse(req.query);
    const sheet = await db().sheet.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, select: { id: true, slug: true, name: true, description: true, source: true, category: true, estimatedMinutes: true, status: true } });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement sheet not found." } });
    const where = canonicalProblemWhere(input, req.auth.sub, sheet.id);
    const [total, associations] = await db().$transaction([
      db().sheetProblem.count({ where: { sheetId: sheet.id, problem: where } }),
      db().sheetProblem.findMany({
        where: { sheetId: sheet.id, problem: where },
        orderBy: { sequence: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { topic: { select: { id: true, slug: true, name: true } }, problem: { include: problemInclude(req.auth.sub) } },
      }),
    ]);
    const items = associations.map((association) => ({ ...publicProblem(association.problem), sheetOrder: association.sequence, sheetTopic: association.topic }));
    res.json({ data: { sheet, items, page: input.page, pageSize: input.pageSize, total, pages: Math.ceil(total / input.pageSize) } });
  } catch (error) { next(error); }
}

async function listProblems(req, res, next, forcedFilters = {}) {
  try {
    const input = listSchema.parse({ ...req.query, ...forcedFilters });
    const where = canonicalProblemWhere(input, req.auth.sub);
    const total = await db().problem.count({ where });
    let problems;
    if (input.sort === "recent") {
      const recent = await db().sheetProblemProgress.findMany({
        where: { userId: req.auth.sub, problem: where },
        orderBy: [{ updatedAt: "desc" }, { problemId: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: { problemId: true },
      });
      const orderedIds = recent.map((item) => item.problemId);
      const fetched = orderedIds.length ? await db().problem.findMany({ where: { ...where, id: { in: orderedIds } }, include: problemInclude(req.auth.sub) }) : [];
      const byId = new Map(fetched.map((problem) => [problem.id, problem]));
      problems = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      problems = await db().problem.findMany({
        where,
        orderBy: problemOrder(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: problemInclude(req.auth.sub),
      });
    }
    res.json({ data: { items: problems.map(publicProblem), page: input.page, pageSize: input.pageSize, total, pages: Math.ceil(total / input.pageSize) } });
  } catch (error) { next(error); }
}

async function getProblem(req, res, next) {
  try {
    const uuid = z.string().uuid().safeParse(req.params.id);
    const problem = await db().problem.findFirst({
      where: { ...(uuid.success ? { id: req.params.id } : { slug: req.params.id }), status: "PUBLISHED", canonicalProblemId: null },
      include: problemInclude(req.auth.sub),
    });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement problem not found." } });
    res.json({ data: publicProblem(problem) });
  } catch (error) { next(error); }
}

async function listTopics(_req, res, next) {
  try {
    const topics = await db().codingTopic.findMany({
      where: { problems: { some: { problem: { status: "PUBLISHED", canonicalProblemId: null } } } },
      orderBy: { name: "asc" },
      include: { _count: { select: { problems: { where: { problem: { status: "PUBLISHED", canonicalProblemId: null } } } } } },
    });
    res.json({ data: topics.map(({ id, slug, name, category, _count }) => ({ id, slug, name, category, problemCount: _count.problems })) });
  } catch (error) { next(error); }
}

async function listPatterns(_req, res, next) {
  try {
    const patterns = await db().codingPattern.findMany({
      where: { problems: { some: { problem: { status: "PUBLISHED", canonicalProblemId: null } } } },
      orderBy: { name: "asc" },
      include: { _count: { select: { problems: { where: { problem: { status: "PUBLISHED", canonicalProblemId: null } } } } } },
    });
    res.json({ data: patterns.map(({ id, slug, name, _count }) => ({ id, slug, name, problemCount: _count.problems })) });
  } catch (error) { next(error); }
}

async function startSheet(req, res, next) {
  try {
    const sheet = await db().sheet.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, select: { id: true } });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement sheet not found." } });
    const engagement = await db().codingSheetEngagement.upsert({
      where: { userId_sheetId: { userId: req.auth.sub, sheetId: sheet.id } },
      update: { lastActivityAt: new Date() },
      create: { userId: req.auth.sub, sheetId: sheet.id },
    });
    res.json({ data: { started: true, firstStartedAt: engagement.firstStartedAt, lastActivityAt: engagement.lastActivityAt } });
  } catch (error) { next(error); }
}

async function updateProgress(req, res, next) {
  try {
    const { status } = progressSchema.parse(req.body);
    const prisma = db();
    const found = await prisma.problem.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        status: "PUBLISHED",
      },
      select: { id: true, canonicalProblemId: true, topicId: true },
    });
    if (!found) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement problem not found." } });
    const problemId = found.canonicalProblemId || found.id;
    const progress = await prisma.$transaction(async (tx) => {
      const key = { userId_problemId: { userId: req.auth.sub, problemId } };
      const existing = await tx.sheetProblemProgress.findUnique({ where: key });
      if (existing?.status === status) return existing;
      const enteringAttempted = ["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"].includes(status)
        && !["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"].includes(existing?.status);
      const now = new Date();
      const updated = await tx.sheetProblemProgress.upsert({
        where: key,
        create: { userId: req.auth.sub, problemId, status, attempts: enteringAttempted ? 1 : 0, solvedAt: status === "SOLVED" ? now : null, completedAt: status === "SOLVED" ? now : null },
        update: {
          status,
          attempts: enteringAttempted ? { increment: 1 } : undefined,
          solvedAt: status === "SOLVED" ? existing?.solvedAt || now : existing?.solvedAt,
          completedAt: status === "SOLVED" ? existing?.completedAt || now : existing?.completedAt,
        },
      });
      const profile = await tx.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
      if (profile) {
        await tx.studentActivity.create({
          data: { studentProfileId: profile.id, activityType: "CODING_SHEET_PROGRESS", topicId: found.topicId, sourceId: problemId, metadata: { status } },
        });
      }
      return updated;
    });
    res.json({ data: progress });
  } catch (error) { next(error); }
}

async function bookmarkProblem(req, res, next) {
  try {
    const problem = await db().problem.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }], status: "PUBLISHED" }, select: { id: true, canonicalProblemId: true } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement problem not found." } });
    const bookmark = await db().placementProblemBookmark.upsert({
      where: { userId_problemId: { userId: req.auth.sub, problemId: problem.canonicalProblemId || problem.id } },
      update: {},
      create: { userId: req.auth.sub, problemId: problem.canonicalProblemId || problem.id },
    });
    res.status(201).json({ data: { bookmarked: true, createdAt: bookmark.createdAt } });
  } catch (error) { next(error); }
}

async function removeBookmark(req, res, next) {
  try {
    const problem = await db().problem.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }], status: "PUBLISHED" }, select: { id: true, canonicalProblemId: true } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement problem not found." } });
    await db().placementProblemBookmark.deleteMany({ where: { userId: req.auth.sub, problemId: problem.canonicalProblemId || problem.id } });
    res.status(204).send();
  } catch (error) { next(error); }
}

async function updateNote(req, res, next) {
  try {
    const { note } = noteSchema.parse(req.body);
    const problem = await db().problem.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }], status: "PUBLISHED" }, select: { id: true, canonicalProblemId: true } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement problem not found." } });
    const problemId = problem.canonicalProblemId || problem.id;
    if (!note.trim()) {
      await db().placementProblemNote.deleteMany({ where: { userId: req.auth.sub, problemId } });
      res.json({ data: { note: "" } });
      return;
    }
    const saved = await db().placementProblemNote.upsert({
      where: { userId_problemId: { userId: req.auth.sub, problemId } },
      update: { note: note.trim() },
      create: { userId: req.auth.sub, problemId, note: note.trim() },
      select: { note: true, updatedAt: true },
    });
    res.json({ data: saved });
  } catch (error) { next(error); }
}

async function listSavedProblems(req, res, next) {
  return listProblems(req, res, next, { bookmarked: true });
}

async function progressSummary(req, res, next) {
  try {
    const prisma = db();
    const problems = await prisma.problem.findMany({
      where: { status: "PUBLISHED", canonicalProblemId: null },
      select: {
        id: true,
        difficulty: true,
        platform: true,
        placementPriority: true,
        progress: { where: { userId: req.auth.sub }, select: { status: true } },
        codingTopics: { include: { topic: { select: { name: true } } } },
      },
    });
    const totals = { total: problems.length, attempted: 0, solved: 0, revisionRequired: 0, remaining: 0, completionPercent: 0 };
    const difficulty = {};
    const platform = {};
    const topics = new Map();
    for (const problem of problems) {
      const status = problem.progress[0]?.status || "NOT_STARTED";
      if (["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"].includes(status)) totals.attempted += 1;
      if (status === "SOLVED") totals.solved += 1;
      if (status === "REVISION_REQUIRED") totals.revisionRequired += 1;
      if (status !== "SOLVED") totals.remaining += 1;
      difficulty[problem.difficulty] ||= { total: 0, solved: 0, attempted: 0 };
      difficulty[problem.difficulty].total += 1;
      if (status === "SOLVED") difficulty[problem.difficulty].solved += 1;
      if (["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"].includes(status)) difficulty[problem.difficulty].attempted += 1;
      platform[problem.platform] = (platform[problem.platform] || 0) + 1;
      for (const { topic } of problem.codingTopics) {
        const item = topics.get(topic.name) || { name: topic.name, total: 0, solved: 0 };
        item.total += 1;
        if (status === "SOLVED") item.solved += 1;
        topics.set(topic.name, item);
      }
    }
    totals.completionPercent = totals.total ? Math.round((totals.solved / totals.total) * 100) : 0;
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    const since = new Date(Date.now() - 180 * 86400000);
    const activity = profile ? await prisma.studentActivity.findMany({
      where: { studentProfileId: profile.id, activityType: "CODING_SHEET_PROGRESS", occurredAt: { gte: since }, metadata: { path: ["status"], equals: "SOLVED" } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }) : [];
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: activity.filter((item) => item.occurredAt.toISOString().slice(0, 10) === key).length };
    });
    const monthly = new Map();
    for (const item of activity) {
      const key = item.occurredAt.toISOString().slice(0, 7);
      monthly.set(key, (monthly.get(key) || 0) + 1);
    }
    const sheets = await prisma.sheet.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      include: { problems: { where: { problem: { status: "PUBLISHED", canonicalProblemId: null } }, include: { problem: { select: { progress: { where: { userId: req.auth.sub, status: "SOLVED" }, select: { id: true } } } } } } },
    });
    const sheetProgress = sheets.map((sheet) => {
      const count = sheet.problems.length;
      const solved = sheet.problems.filter((link) => link.problem.progress.length > 0).length;
      return { id: sheet.id, slug: sheet.slug, name: sheet.name, total: count, solved, completionPercent: count ? Math.round((solved / count) * 100) : 0 };
    });
    const topicProgress = [...topics.values()].map((item) => ({ ...item, completionPercent: item.total ? Math.round((item.solved / item.total) * 100) : 0 })).sort((a, b) => b.completionPercent - a.completionPercent || a.name.localeCompare(b.name));
    const nextProblems = await prisma.problem.findMany({
      where: { status: "PUBLISHED", canonicalProblemId: null, progress: { none: { userId: req.auth.sub } } },
      orderBy: [{ placementPriority: "asc" }, { title: "asc" }],
      take: 5,
      select: { id: true, slug: true, title: true, difficulty: true, platform: true },
    });
    res.json({
      data: {
        totals,
        difficulty,
        platform,
        sheetProgress,
        topics: topicProgress,
        strongTopics: topicProgress.filter((item) => item.total >= 2 && item.completionPercent >= 60).slice(0, 5),
        weakTopics: topicProgress.filter((item) => item.total >= 2 && item.completionPercent < 40).sort((a, b) => a.completionPercent - b.completionPercent).slice(0, 5),
        weeklyActivity: weekly,
        monthlyActivity: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
        recommendedNextProblems: nextProblems,
      },
    });
  } catch (error) { next(error); }
}

async function sheetProgress(req, res, next) {
  try {
    const sheet = await db().sheet.findFirst({ where: { id: req.params.sheetId, status: "PUBLISHED" }, select: { id: true, slug: true, name: true } });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Placement sheet not found." } });
    const rows = await db().sheetProblem.findMany({
      where: { sheetId: sheet.id, problem: { status: "PUBLISHED", canonicalProblemId: null } },
      include: {
        problem: {
          select: {
            difficulty: true,
            progress: { where: { userId: req.auth.sub }, select: { status: true } },
          },
        },
        topic: true,
      },
    });
    const counts = { NOT_STARTED: 0, ATTEMPTED: 0, SOLVED: 0, REVISION_REQUIRED: 0 };
    const difficulty = { EASY: { total: 0, solved: 0 }, MEDIUM: { total: 0, solved: 0 }, HARD: { total: 0, solved: 0 } };
    const topics = new Map();
    for (const row of rows) {
      const status = row.problem.progress[0]?.status || "NOT_STARTED";
      counts[status] += 1;
      difficulty[row.problem.difficulty] ||= { total: 0, solved: 0 };
      difficulty[row.problem.difficulty].total += 1;
      if (status === "SOLVED") difficulty[row.problem.difficulty].solved += 1;
      const topic = topics.get(row.topic.name) || { name: row.topic.name, total: 0, solved: 0 };
      topic.total += 1;
      if (status === "SOLVED") topic.solved += 1;
      topics.set(row.topic.name, topic);
    }
    res.json({ data: { sheet, counts, difficulty, topics: [...topics.values()], total: rows.length, completionPercent: rows.length ? Math.round((counts.SOLVED / rows.length) * 100) : 0 } });
  } catch (error) { next(error); }
}

studentRouter.get("/sheets", listSheets);
studentRouter.get("/sheets/:slug", getSheet);
studentRouter.post("/sheets/:slug/start", startSheet);
studentRouter.get("/problems", listProblems);
studentRouter.get("/problems/:id", getProblem);
studentRouter.get("/topics", listTopics);
studentRouter.get("/patterns", listPatterns);
studentRouter.get("/progress/summary", progressSummary);
studentRouter.get("/progress/sheets/:sheetId", sheetProgress);
studentRouter.get("/bookmarks", listSavedProblems);
studentRouter.get("/revision", (req, res, next) => {
  listProblems(req, res, next, { progress: "REVISION_REQUIRED" });
});
studentRouter.put("/problems/:id/progress", updateProgress);
studentRouter.post("/problems/:id/bookmark", bookmarkProblem);
studentRouter.delete("/problems/:id/bookmark", removeBookmark);
studentRouter.put("/problems/:id/note", updateNote);

module.exports = {
  studentRouter,
  canonicalProblemWhere,
  publicProblem,
  normalizePlatform: (value) => value === "CODINGNINJAS" ? "CODE360" : value,
  normalizeProblemUrl(value, platform) {
    const normalizedPlatform = platform === "CODINGNINJAS" ? "CODE360" : platform;
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localSuffixes = [".localhost", ".local", ".internal", ".test", ".invalid", ".example"];
    if (url.protocol !== "https:" || url.username || url.password || !hostname.includes(".") || isIP(hostname)
      || hostname === "localhost" || hostname === "localhost.localdomain" || localSuffixes.some((suffix) => hostname.endsWith(suffix))) {
      throw new Error("Problem links must use a public HTTPS host.");
    }
    const allowed = hostByPlatform[normalizedPlatform];
    if (allowed && !allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error(`The external URL does not match ${normalizedPlatform}.`);
    }
    url.hash = "";
    url.search = "";
    const displayPath = url.pathname.replace(/\/+$/, "") || "/";
    const canonicalUrl = `${url.origin.toLowerCase()}${displayPath}`;
    if (normalizedPlatform === "LEETCODE" && displayPath !== "/") url.pathname = `${displayPath}/`;
    else url.pathname = displayPath;
    return { url: url.href, canonicalUrl };
  },
};
