"use strict";

const crypto = require("node:crypto");
const { isIP } = require("node:net");
const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { normalizePlatform, normalizeProblemUrl } = require("./coding-library");

const router = express.Router();
const catalogueStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const platforms = ["LEETCODE", "GFG", "CODE360", "HACKERRANK", "CODECHEF", "INTERVIEWBIT", "CODEFORCES", "OTHER"];
const sheetInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(220).optional(),
  description: z.string().trim().min(1).max(5000),
  source: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80).default("DSA"),
  estimatedMinutes: z.number().int().positive().max(100_000).nullable().optional(),
  status: z.enum(catalogueStatuses).default("DRAFT"),
});
const problemInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  summary: z.string().trim().max(1000).nullable().optional(),
  subtopic: z.string().trim().max(160).nullable().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  platform: z.enum([...platforms, "CODINGNINJAS"]),
  url: z.string().url(),
  topic: z.string().trim().min(1).max(160),
  patterns: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
  placementPriority: z.number().int().min(1).max(5).nullable().optional(),
  estimatedMinutes: z.number().int().positive().max(600).nullable().optional(),
  attribution: z.string().trim().max(500).nullable().optional(),
  status: z.enum(catalogueStatuses).optional(),
  sequence: z.number().int().min(1).optional(),
});
const csvSchema = z.object({ csv: z.string().min(1).max(250_000) });

function db() {
  return getPrisma();
}

function normalizeExternalProblemUrl(value, platform) {
  try {
    return normalizeProblemUrl(value, platform);
  } catch (error) {
    error.status = 400;
    error.code = "INVALID_EXTERNAL_URL";
    throw error;
  }
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableSlug(value) {
  const suffix = crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 8);
  return `${slugify(value) || "item"}-${suffix}`;
}

async function writeAudit(tx, req, action, resourceType, resourceId, after, before = null) {
  await tx.auditLog.create({
    data: {
      actorUserId: req.auth.sub,
      createdByUserId: req.auth.sub,
      action,
      resourceType,
      resourceId: resourceId || null,
      before: before || undefined,
      after,
      requestId: req.requestId || crypto.randomUUID(),
    },
  });
}

async function ensureTopics(tx, sheet, name, patterns, subtopicName) {
  const existingLegacyTopic = await tx.topic.findFirst({ where: { subjectId: sheet.subjectId, name } });
  const legacyTopic = existingLegacyTopic || await tx.topic.create({
    data: { subjectId: sheet.subjectId, name, slug: stableSlug(name).slice(0, 160) },
  });
  const codingTopic = await tx.codingTopic.upsert({
    where: { name },
    update: {},
    create: { name, slug: stableSlug(name), category: sheet.category },
  });
  if (subtopicName) {
    await tx.codingSubtopic.upsert({
      where: { topicId_name: { topicId: codingTopic.id, name: subtopicName } },
      update: { slug: stableSlug(subtopicName) },
      create: { topicId: codingTopic.id, name: subtopicName, slug: stableSlug(subtopicName) },
    });
  }
  for (const patternName of patterns) {
    await tx.codingPattern.upsert({
      where: { name: patternName },
      update: {},
      create: { name: patternName, slug: stableSlug(patternName) },
    });
  }
  return { legacyTopic, codingTopic };
}

async function associateProblem(tx, sheet, row, sequence) {
  const platform = normalizePlatform(row.platform);
  const { url, canonicalUrl } = normalizeExternalProblemUrl(row.url, platform);
  const { legacyTopic, codingTopic } = await ensureTopics(tx, sheet, row.topic, row.patterns, row.subtopic);
  const problem = await tx.problem.upsert({
    where: { canonicalUrl },
    update: {
      title: row.title,
      summary: row.summary,
      subtopic: row.subtopic,
      difficulty: row.difficulty,
      platform,
      url,
      attribution: row.attribution || `${platform} problem link; metadata independently curated`,
      placementPriority: row.placementPriority,
      estimatedMinutes: row.estimatedMinutes,
    },
    create: {
      slug: stableSlug(`${row.title}-${canonicalUrl}`),
      topicId: legacyTopic.id,
      title: row.title,
      summary: row.summary,
      subtopic: row.subtopic,
      difficulty: row.difficulty,
      platform,
      url,
      canonicalUrl,
      attribution: row.attribution || `${platform} problem link; metadata independently curated`,
      placementPriority: row.placementPriority,
      estimatedMinutes: row.estimatedMinutes,
      status: row.status || "DRAFT",
    },
  });
  const existingTags = await tx.codingProblemTopic.count({ where: { problemId: problem.id } });
  await tx.codingProblemTopic.upsert({
    where: { problemId_topicId: { problemId: problem.id, topicId: codingTopic.id } },
    update: {},
    create: { problemId: problem.id, topicId: codingTopic.id, isPrimary: existingTags === 0 },
  });
  for (const patternName of row.patterns) {
    const pattern = await tx.codingPattern.findUniqueOrThrow({ where: { name: patternName } });
    await tx.codingProblemPattern.upsert({
      where: { problemId_patternId: { problemId: problem.id, patternId: pattern.id } },
      update: {},
      create: { problemId: problem.id, patternId: pattern.id },
    });
  }
  const association = await tx.sheetProblem.upsert({
    where: { sheetId_problemId: { sheetId: sheet.id, problemId: problem.id } },
    update: { topicId: codingTopic.id, sequence },
    create: { sheetId: sheet.id, problemId: problem.id, topicId: codingTopic.id, sequence },
  });
  return { problem, association };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw Object.assign(new Error("CSV contains an unclosed quoted field."), { status: 400, code: "INVALID_CSV" });
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw Object.assign(new Error("CSV needs a header row and at least one problem row."), { status: 400, code: "INVALID_CSV" });
  const headers = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim().toLowerCase().replace(/[\s_-]+/g, ""));
  if (new Set(headers).size !== headers.length) throw Object.assign(new Error("CSV contains duplicate column names."), { status: 400, code: "INVALID_CSV" });
  const required = ["sheetslug", "title", "difficulty", "platform", "url", "topic"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw Object.assign(new Error(`CSV is missing required columns: ${missing.join(", ")}.`), { status: 400, code: "INVALID_CSV" });
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw Object.assign(new Error(`CSV row ${index + 2} has ${cells.length} values; expected ${headers.length}.`), { status: 400, code: "INVALID_CSV" });
    return { rowNumber: index + 2, ...Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()])) };
  });
}

function normalizeCsvRow(row) {
  const difficulty = String(row.difficulty || "").trim().toUpperCase();
  const platform = normalizePlatform(String(row.platform || "").trim().toUpperCase());
  const patterns = String(row.patterns || "").split("|").map((value) => value.trim()).filter(Boolean);
  const input = {
    title: row.title,
    summary: row.summary || null,
    subtopic: row.subtopic || null,
    difficulty,
    platform,
    url: row.url,
    topic: row.topic,
    patterns,
    placementPriority: row.placementpriority ? Number(row.placementpriority) : null,
    estimatedMinutes: row.estimatedminutes ? Number(row.estimatedminutes) : null,
    attribution: row.attribution || null,
    status: row.status ? String(row.status).trim().toUpperCase() : undefined,
  };
  const parsed = problemInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };
  try {
    const canonical = normalizeExternalProblemUrl(parsed.data.url, parsed.data.platform);
    return { value: { ...parsed.data, ...canonical, sheetSlug: row.sheetslug } };
  } catch (error) {
    return { error: error.message };
  }
}

function parseImport(csv) {
  const inputRows = parseCsv(csv);
  if (inputRows.length > 2000) throw Object.assign(new Error("CSV import is limited to 2,000 rows per request."), { status: 400, code: "IMPORT_TOO_LARGE" });
  const records = [];
  const errors = [];
  const unique = new Set();
  for (const row of inputRows) {
    const normalized = normalizeCsvRow(row);
    if (normalized.error) {
      errors.push({ row: row.rowNumber, message: normalized.error });
      continue;
    }
    const value = normalized.value;
    if (!value.sheetSlug || value.sheetSlug.length > 220) {
      errors.push({ row: row.rowNumber, message: "Sheet slug is required and must be at most 220 characters." });
      continue;
    }
    const key = `${value.sheetSlug}\u0000${value.canonicalUrl}`;
    if (unique.has(key)) {
      errors.push({ row: row.rowNumber, message: "The same problem URL appears more than once for this sheet in the CSV." });
      continue;
    }
    unique.add(key);
    records.push({ ...value, rowNumber: row.rowNumber });
  }
  return { records, errors };
}

router.get("/sheets", async (_req, res, next) => {
  try {
    const sheets = await db().sheet.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { problems: true, engagements: true } } },
    });
    res.json({ data: sheets.map((sheet) => ({ id: sheet.id, slug: sheet.slug, name: sheet.name, category: sheet.category, source: sheet.source, status: sheet.status, problemCount: sheet._count.problems, starts: sheet._count.engagements })) });
  } catch (error) { next(error); }
});

router.get("/sheets/:id", async (req, res, next) => {
  try {
    const sheet = await db().sheet.findUnique({
      where: { id: req.params.id },
      include: {
        problems: {
          orderBy: { sequence: "asc" },
          include: {
            topic: { select: { id: true, name: true } },
            problem: { select: { id: true, slug: true, title: true, summary: true, difficulty: true, platform: true, url: true, attribution: true, verifiedAt: true, status: true, placementPriority: true, estimatedMinutes: true, subtopic: true, patterns: { include: { pattern: { select: { id: true, name: true } } } }, companies: true } },
          },
        },
      },
    });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sheet not found." } });
    res.json({ data: { ...sheet, problems: sheet.problems.map(({ problem, topic, sequence }) => ({ ...problem, topic, sequence })) } });
  } catch (error) { next(error); }
});

router.get("/stats", async (_req, res, next) => {
  try {
    const prisma = db();
    const [sheets, problems, associations, verified, unverified, duplicates] = await Promise.all([
      prisma.sheet.count(),
      prisma.problem.count({ where: { canonicalProblemId: null } }),
      prisma.sheetProblem.count(),
      prisma.problem.count({ where: { canonicalProblemId: null, verifiedAt: { not: null } } }),
      prisma.problem.count({ where: { canonicalProblemId: null, verifiedAt: null } }),
      prisma.problem.count({ where: { canonicalProblemId: { not: null } } }),
    ]);
    res.json({ data: { sheets, uniqueProblems: problems, sheetAssociations: associations, verifiedLinks: verified, unverifiedLinks: unverified, duplicateAliases: duplicates } });
  } catch (error) { next(error); }
});

router.post("/sheets", async (req, res, next) => {
  try {
    const input = sheetInputSchema.parse(req.body);
    const prisma = db();
    const slug = input.slug || stableSlug(input.name);
    const created = await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({ data: { name: input.name, slug: stableSlug(`subject-${slug}`), status: input.status } });
      const sheet = await tx.sheet.create({
        data: { name: input.name, slug, description: input.description, source: input.source, category: input.category, estimatedMinutes: input.estimatedMinutes, status: input.status, subjectId: subject.id },
      });
      await writeAudit(tx, req, "CODING_SHEET_CREATED", "Sheet", sheet.id, { name: sheet.name, status: sheet.status });
      return sheet;
    });
    res.status(201).json({ data: created });
  } catch (error) { next(error); }
});

router.patch("/sheets/:id", async (req, res, next) => {
  try {
    const input = sheetInputSchema.partial().parse(req.body);
    if (!Object.keys(input).length) return res.status(400).json({ error: { code: "EMPTY_UPDATE", message: "At least one sheet field must be provided." } });
    const prisma = db();
    const existing = await prisma.sheet.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sheet not found." } });
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.sheet.update({ where: { id: existing.id }, data: { ...input, slug: input.slug || (input.name ? stableSlug(input.name) : undefined) } });
      await tx.subject.update({ where: { id: existing.subjectId }, data: { name: result.name, status: input.status || existing.status } });
      await writeAudit(tx, req, "CODING_SHEET_UPDATED", "Sheet", existing.id, { status: result.status, name: result.name }, { status: existing.status, name: existing.name });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.post("/sheets/:id/problems", async (req, res, next) => {
  try {
    const input = problemInputSchema.parse(req.body);
    const prisma = db();
    const sheet = await prisma.sheet.findUnique({ where: { id: req.params.id } });
    if (!sheet) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sheet not found." } });
    const sequence = input.sequence || (await prisma.sheetProblem.count({ where: { sheetId: sheet.id } })) + 1;
    const result = await prisma.$transaction(async (tx) => {
      const association = await associateProblem(tx, sheet, input, sequence);
      await writeAudit(tx, req, "CODING_PROBLEM_ASSOCIATED", "Problem", association.problem.id, { sheetId: sheet.id, slug: association.problem.slug, sequence });
      return association;
    });
    res.status(201).json({ data: { problemId: result.problem.id, slug: result.problem.slug, sheetId: result.association.sheetId, sequence: result.association.sequence } });
  } catch (error) { next(error); }
});

router.patch("/problems/:id", async (req, res, next) => {
  try {
    const input = problemInputSchema.omit({ sequence: true }).partial().parse(req.body);
    const prisma = db();
    const existing = await prisma.problem.findFirst({ where: { id: req.params.id, canonicalProblemId: null } });
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Canonical problem not found." } });
    const normalized = input.url || input.platform
      ? normalizeExternalProblemUrl(input.url || existing.url, normalizePlatform(input.platform || existing.platform))
      : null;
    const updated = await prisma.$transaction(async (tx) => {
      const { topic, patterns, ...problemFields } = input;
      const result = await tx.problem.update({
        where: { id: existing.id },
        data: { ...problemFields, ...(normalized || {}), slug: input.title ? stableSlug(`${input.title}-${normalized?.canonicalUrl || existing.canonicalUrl}`) : undefined },
      });
      if (topic) {
        const codingTopic = await tx.codingTopic.upsert({
          where: { name: topic },
          update: {},
          create: { name: topic, slug: stableSlug(topic), category: "DSA" },
        });
        await tx.codingProblemTopic.updateMany({ where: { problemId: result.id, isPrimary: true }, data: { isPrimary: false } });
        await tx.codingProblemTopic.upsert({
          where: { problemId_topicId: { problemId: result.id, topicId: codingTopic.id } },
          update: { isPrimary: true },
          create: { problemId: result.id, topicId: codingTopic.id, isPrimary: true },
        });
        await tx.sheetProblem.updateMany({ where: { problemId: result.id }, data: { topicId: codingTopic.id } });
      }
      if (patterns) {
        await tx.codingProblemPattern.deleteMany({ where: { problemId: result.id } });
        for (const patternName of patterns) {
          const pattern = await tx.codingPattern.upsert({
            where: { name: patternName },
            update: {},
            create: { name: patternName, slug: stableSlug(patternName) },
          });
          await tx.codingProblemPattern.create({ data: { problemId: result.id, patternId: pattern.id } });
        }
      }
      await writeAudit(tx, req, "CODING_PROBLEM_UPDATED", "Problem", existing.id, { title: result.title, status: result.status }, { title: existing.title, status: existing.status });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.delete("/sheets/:sheetId/problems/:problemId", async (req, res, next) => {
  try {
    const removed = await db().$transaction(async (tx) => {
      const result = await tx.sheetProblem.deleteMany({ where: { sheetId: req.params.sheetId, problemId: req.params.problemId } });
      if (result.count) await writeAudit(tx, req, "CODING_PROBLEM_DISASSOCIATED", "Sheet", req.params.sheetId, { problemId: req.params.problemId });
      return result;
    });
    if (!removed.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Sheet/problem association not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

router.patch("/sheets/:id/order", async (req, res, next) => {
  try {
    const { problemIds } = z.object({ problemIds: z.array(z.string().uuid()).min(1).max(2000) }).parse(req.body);
    if (new Set(problemIds).size !== problemIds.length) return res.status(400).json({ error: { code: "DUPLICATE_PROBLEM", message: "Problem IDs must be unique." } });
    const prisma = db();
    const links = await prisma.sheetProblem.findMany({ where: { sheetId: req.params.id }, select: { problemId: true } });
    if (links.length !== problemIds.length || problemIds.some((id) => !links.some((link) => link.problemId === id))) {
      return res.status(400).json({ error: { code: "INVALID_ORDER", message: "The ordered IDs must include every problem associated with the sheet exactly once." } });
    }
    await prisma.$transaction(async (tx) => {
      await tx.sheetProblem.updateMany({ where: { sheetId: req.params.id }, data: { sequence: { increment: 1_000_000 } } });
      for (const [index, problemId] of problemIds.entries()) {
        await tx.sheetProblem.update({ where: { sheetId_problemId: { sheetId: req.params.id, problemId } }, data: { sequence: index + 1 } });
      }
      await writeAudit(tx, req, "CODING_SHEET_REORDERED", "Sheet", req.params.id, { problemCount: problemIds.length });
    });
    res.json({ data: { updated: problemIds.length } });
  } catch (error) { next(error); }
});

router.post("/topics", async (req, res, next) => {
  try {
    const { name, category } = z.object({ name: z.string().trim().min(1).max(160), category: z.string().trim().max(80).nullable().optional() }).parse(req.body);
    const topic = await db().codingTopic.upsert({ where: { name }, update: { category }, create: { name, slug: stableSlug(name), category } });
    res.status(201).json({ data: topic });
  } catch (error) { next(error); }
});

router.post("/topics/:topicId/subtopics", async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(1).max(180) }).parse(req.body);
    const topic = await db().codingTopic.findUnique({ where: { id: req.params.topicId }, select: { id: true } });
    if (!topic) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Topic not found." } });
    const subtopic = await db().codingSubtopic.upsert({
      where: { topicId_name: { topicId: topic.id, name } },
      update: {},
      create: { topicId: topic.id, name, slug: stableSlug(name) },
    });
    res.status(201).json({ data: subtopic });
  } catch (error) { next(error); }
});

router.post("/problems/:id/companies", async (req, res, next) => {
  try {
    const input = z.object({
      companyName: z.string().trim().min(1).max(160),
      evidenceUrl: z.string().url().max(2048),
      verified: z.boolean().default(false),
    }).parse(req.body);
    const evidence = new URL(input.evidenceUrl);
    const hostname = evidence.hostname.toLowerCase();
    if (evidence.protocol !== "https:" || evidence.username || evidence.password || !hostname.includes(".") || isIP(hostname)
      || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return res.status(400).json({ error: { code: "INVALID_EVIDENCE_URL", message: "Company evidence links must use a public HTTPS host." } });
    }
    const problem = await db().problem.findFirst({ where: { id: req.params.id, canonicalProblemId: null }, select: { id: true } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Canonical problem not found." } });
    const result = await db().$transaction(async (tx) => {
      const company = await tx.codingProblemCompany.upsert({
        where: { problemId_companyName: { problemId: problem.id, companyName: input.companyName } },
        update: { evidenceUrl: evidence.href, verifiedAt: input.verified ? new Date() : null },
        create: { problemId: problem.id, companyName: input.companyName, evidenceUrl: evidence.href, verifiedAt: input.verified ? new Date() : null },
      });
      await writeAudit(tx, req, input.verified ? "CODING_COMPANY_TAG_VERIFIED" : "CODING_COMPANY_TAG_UPDATED", "Problem", problem.id, { companyName: company.companyName, verifiedAt: company.verifiedAt });
      return company;
    });
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
});

router.post("/patterns", async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(1).max(180) }).parse(req.body);
    const pattern = await db().codingPattern.upsert({ where: { name }, update: {}, create: { name, slug: stableSlug(name) } });
    res.status(201).json({ data: pattern });
  } catch (error) { next(error); }
});

router.patch("/problems/:id/verification", async (req, res, next) => {
  try {
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
    const problem = await db().problem.findFirst({ where: { id: req.params.id, canonicalProblemId: null } });
    if (!problem) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Canonical problem not found." } });
    const updated = await db().$transaction(async (tx) => {
      const result = await tx.problem.update({ where: { id: problem.id }, data: { verifiedAt: verified ? new Date() : null } });
      await writeAudit(tx, req, verified ? "CODING_LINK_VERIFIED" : "CODING_LINK_UNVERIFIED", "Problem", problem.id, { verifiedAt: result.verifiedAt });
      return result;
    });
    res.json({ data: { id: updated.id, verifiedAt: updated.verifiedAt } });
  } catch (error) { next(error); }
});

router.post("/import/preview", async (req, res, next) => {
  try {
    const { csv } = csvSchema.parse(req.body);
    const parsed = parseImport(csv);
    const prisma = db();
    const previews = await Promise.all(parsed.records.map(async (row) => {
      const sheet = await prisma.sheet.findUnique({ where: { slug: row.sheetSlug }, select: { id: true } });
      const problem = await prisma.problem.findUnique({ where: { canonicalUrl: row.canonicalUrl }, select: { id: true, title: true } });
      const associated = sheet && problem
        ? Boolean(await prisma.sheetProblem.findUnique({ where: { sheetId_problemId: { sheetId: sheet.id, problemId: problem.id } }, select: { problemId: true } }))
        : false;
      return { row: row.rowNumber, sheetSlug: row.sheetSlug, title: row.title, existsInCatalogue: Boolean(problem), alreadyAssociated: associated, missingSheet: !sheet };
    }));
    res.json({ data: { rows: parsed.records.length, validRows: parsed.records.length - previews.filter((row) => row.missingSheet).length, errors: [...parsed.errors, ...previews.filter((row) => row.missingSheet).map((row) => ({ row: row.row, message: "Sheet slug was not found." }))], duplicates: previews.filter((row) => row.existsInCatalogue), alreadyAssociated: previews.filter((row) => row.alreadyAssociated) } });
  } catch (error) { next(error); }
});

router.post("/import", async (req, res, next) => {
  try {
    const { csv } = csvSchema.parse(req.body);
    const parsed = parseImport(csv);
    const prisma = db();
    const missingSheets = [];
    const sheets = new Map();
    for (const row of parsed.records) {
      if (!sheets.has(row.sheetSlug)) sheets.set(row.sheetSlug, await prisma.sheet.findUnique({ where: { slug: row.sheetSlug } }));
      if (!sheets.get(row.sheetSlug)) missingSheets.push({ row: row.rowNumber, message: "Sheet slug was not found." });
    }
    const errors = [...parsed.errors, ...missingSheets];
    if (errors.length) return res.status(400).json({ error: { code: "IMPORT_VALIDATION_FAILED", message: "CSV contains invalid rows.", details: errors } });
    const result = await prisma.$transaction(async (tx) => {
      const sequenceBySheet = new Map();
      let createdOrAssociated = 0;
      let existingLinks = 0;
      for (const row of parsed.records) {
        const sheet = sheets.get(row.sheetSlug);
        if (!sequenceBySheet.has(sheet.id)) sequenceBySheet.set(sheet.id, await tx.sheetProblem.count({ where: { sheetId: sheet.id } }));
        const sequence = sequenceBySheet.get(sheet.id) + 1;
        sequenceBySheet.set(sheet.id, sequence);
        const already = await tx.problem.findUnique({ where: { canonicalUrl: row.canonicalUrl }, select: { id: true } });
        const linked = already && await tx.sheetProblem.findUnique({ where: { sheetId_problemId: { sheetId: sheet.id, problemId: already.id } }, select: { problemId: true } });
        await associateProblem(tx, sheet, row, linked ? (await tx.sheetProblem.findUnique({ where: { sheetId_problemId: { sheetId: sheet.id, problemId: already.id } }, select: { sequence: true } })).sequence : sequence);
        if (linked) existingLinks += 1;
        else createdOrAssociated += 1;
      }
      await writeAudit(tx, req, "CODING_CATALOGUE_IMPORTED", "Sheet", null, { rows: parsed.records.length, existingLinks, createdOrAssociated });
      return { imported: parsed.records.length, existingLinks, createdOrAssociated };
    });
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
});

router.use((error, _req, _res, next) => {
  if (error.code === "P2002") {
    error.status = 409;
    error.code = "CATALOGUE_CONFLICT";
    error.message = "A catalogue item with the same unique value already exists.";
  }
  next(error);
});

module.exports = { router, parseCsv, parseImport, associateProblem };
