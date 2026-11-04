"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const studentRouter = express.Router();
const adminRouter = express.Router();
const statusSchema = z.enum(["UNSOLVED", "ATTEMPTED", "SOLVED", "REVISION"]);

studentRouter.get("/", async (_req, res, next) => {
  try {
    const sheets = await getPrisma().dSASheet.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      include: {
        problems: {
          orderBy: [{ sequence: "asc" }, { title: "asc" }],
          include: { progress: { where: { userId: _req.auth.sub }, select: { status: true } } },
        },
      },
    });
    res.json({
      data: sheets.map((sheet) => ({
        ...sheet,
        total: sheet.problems.length,
        completed: sheet.problems.filter((problem) => problem.progress[0]?.status === "SOLVED").length,
        attempted: sheet.problems.filter((problem) => ["ATTEMPTED", "REVISION"].includes(problem.progress[0]?.status)).length,
        problems: undefined,
      })),
    });
  } catch (error) { next(error); }
});

studentRouter.get("/:slug", async (req, res, next) => {
  try {
    const sheet = await getPrisma().dSASheet.findFirst({
      where: { slug: req.params.slug, status: "PUBLISHED" },
      include: {
        problems: {
          orderBy: [{ sequence: "asc" }, { title: "asc" }],
          include: {
            problem: { select: { id: true, slug: true, title: true, difficulty: true, status: true } },
            progress: { where: { userId: req.auth.sub }, select: { status: true, notes: true, solvedAt: true } },
          },
        },
      },
    });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "DSA sheet not found." } });

    res.json({
      data: {
        ...sheet,
        problems: sheet.problems.map((entry) => ({
          ...entry,
          problem: entry.problem?.status === "PUBLISHED" ? entry.problem : null,
          progress: entry.progress[0] || { status: "UNSOLVED", notes: null, solvedAt: null },
        })),
      },
    });
  } catch (error) { next(error); }
});

studentRouter.put("/:slug/problems/:entryId/progress", async (req, res, next) => {
  try {
    const input = z.object({
      status: statusSchema,
      notes: z.string().trim().max(2000).nullable().optional(),
    }).parse(req.body);
    const prisma = getPrisma();
    const entry = await prisma.dSASheetProblem.findFirst({
      where: { id: req.params.entryId, sheet: { slug: req.params.slug, status: "PUBLISHED" } },
      select: { id: true, sheetId: true },
    });
    if (!entry) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sheet problem not found." } });

    const data = await prisma.dSASheetProgress.upsert({
      where: { sheetProblemId_userId: { sheetProblemId: entry.id, userId: req.auth.sub } },
      update: {
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        solvedAt: input.status === "SOLVED" ? new Date() : null,
      },
      create: {
        sheetId: entry.sheetId,
        sheetProblemId: entry.id,
        userId: req.auth.sub,
        status: input.status,
        notes: input.notes || null,
        solvedAt: input.status === "SOLVED" ? new Date() : null,
      },
    });
    res.json({ data });
  } catch (error) { next(error); }
});

const problemInput = z.object({
  title: z.string().trim().min(1).max(240),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).nullable().optional(),
  topic: z.string().trim().max(160).nullable().optional(),
  platform: z.string().trim().max(80).nullable().optional(),
  externalUrl: z.string().url().max(1000).refine((value) => /^https?:\/\//i.test(value), "Problem links must use HTTP or HTTPS.").nullable().optional(),
  problemSlug: z.string().trim().min(1).max(180).nullable().optional(),
});

adminRouter.post("/import/preview", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/),
      author: z.string().trim().max(200).nullable().optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      problems: z.array(problemInput).min(1).max(500),
    }).parse(req.body);
    const duplicates = new Set();
    const problems = await Promise.all(input.problems.map(async (problem, index) => {
      const key = problem.problemSlug ? `slug:${problem.problemSlug}` : problem.externalUrl ? `url:${problem.externalUrl.toLowerCase()}` : `title:${problem.title.toLowerCase()}`;
      const duplicate = duplicates.has(key);
      duplicates.add(key);
      const mappedProblem = problem.problemSlug
        ? await getPrisma().codingProblem.findFirst({ where: { slug: problem.problemSlug, status: "PUBLISHED" }, select: { id: true } })
        : null;
      const valid = !duplicate && (!!mappedProblem || !!problem.externalUrl);
      return { ...problem, sequence: index + 1, duplicate, mapped: !!mappedProblem, valid };
    }));
    res.json({ data: { ...input, problems, valid: problems.every((problem) => problem.valid) } });
  } catch (error) { next(error); }
});

adminRouter.post("/import", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/),
      author: z.string().trim().max(200).nullable().optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      confirm: z.literal(true),
      problems: z.array(problemInput).min(1).max(500),
    }).parse(req.body);
    const prisma = getPrisma();
    const entries = [];
    const seen = new Set();
    for (let index = 0; index < input.problems.length; index += 1) {
      const problem = input.problems[index];
      const key = problem.problemSlug ? `slug:${problem.problemSlug}` : problem.externalUrl ? `url:${problem.externalUrl.toLowerCase()}` : `title:${problem.title.toLowerCase()}`;
      if (seen.has(key)) return res.status(400).json({ error: { code: "DUPLICATE_PROBLEM", message: `Problem "${problem.title}" is duplicated in this sheet.` } });
      seen.add(key);
      let linkedProblem = null;
      if (problem.problemSlug) {
        linkedProblem = await prisma.codingProblem.findFirst({ where: { slug: problem.problemSlug, status: "PUBLISHED" }, select: { id: true } });
        if (!linkedProblem && !problem.externalUrl) {
          return res.status(400).json({ error: { code: "INVALID_PROBLEM_MAPPING", message: `No published coding problem matches "${problem.problemSlug}".` } });
        }
      }
      if (!linkedProblem && !problem.externalUrl) {
        return res.status(400).json({ error: { code: "PROBLEM_LINK_REQUIRED", message: `Add a public URL or a published problem mapping for "${problem.title}".` } });
      }
      entries.push({
        title: problem.title,
        difficulty: problem.difficulty || null,
        topic: problem.topic || null,
        platform: problem.platform || null,
        externalUrl: linkedProblem ? null : problem.externalUrl,
        problemId: linkedProblem?.id || null,
        sequence: index + 1,
      });
    }

    const sheet = await prisma.$transaction(async (tx) => {
      const created = await tx.dSASheet.create({
        data: {
          name: input.name,
          slug: input.slug,
          author: input.author || null,
          description: input.description || null,
          status: "PUBLISHED",
        },
      });
      await tx.dSASheetProblem.createMany({ data: entries.map((entry) => ({ ...entry, sheetId: created.id })) });
      return created;
    });
    res.status(201).json({ data: { ...sheet, importedProblems: entries.length } });
  } catch (error) { next(error); }
});

module.exports = { studentRouter, adminRouter };
