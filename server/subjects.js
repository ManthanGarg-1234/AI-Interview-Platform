"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();

async function profileId(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw Object.assign(new Error("Student profile not found."), { status: 404, code: "PROFILE_NOT_FOUND" });
  return profile.id;
}

// ── List all published subjects ──────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const subjects = await prisma.subject.findMany({
      where: { status: "PUBLISHED" },
      include: {
        topics: {
          include: {
            _count: { select: { resources: true, questions: true, problemTopics: true } },
          },
        },
        _count: { select: { topics: true, resources: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ data: subjects });
  } catch (error) { next(error); }
});

// ── Get student's learning progress across all subjects ──────────────────────
router.get("/me/progress", async (req, res, next) => {
  try {
    const pid = await profileId(req.auth.sub);
    const progress = await getPrisma().learningProgress.findMany({
      where: { studentProfileId: pid },
      include: {
        topic: { select: { id: true, name: true, slug: true, subject: { select: { id: true, name: true, slug: true } } } },
        resource: { select: { id: true, title: true, kind: true } },
      },
      orderBy: { lastActivityAt: "desc" },
    });
    res.json({ data: progress });
  } catch (error) { next(error); }
});

// ── Subject detail with topics and student progress ──────────────────────────
router.get("/:slug", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const subject = await prisma.subject.findUnique({
      where: { slug: req.params.slug, status: "PUBLISHED" },
      include: {
        topics: {
          include: {
            subtopics: true,
            resources: { where: { status: "PUBLISHED" }, orderBy: { title: "asc" } },
            _count: { select: { questions: true, problemTopics: true } },
          },
          orderBy: { name: "asc" },
        },
        resources: { where: { status: "PUBLISHED", topicId: null }, orderBy: { title: "asc" } },
      },
    });
    if (!subject) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Subject not found." } });

    // Fetch student progress for this subject's topics
    const pid = await profileId(req.auth.sub);
    const progress = await prisma.learningProgress.findMany({
      where: { studentProfileId: pid, topic: { subjectId: subject.id } },
      select: { topicId: true, resourceId: true, status: true, percent: true, lastActivityAt: true },
    });

    res.json({ data: subject, progress });
  } catch (error) { next(error); }
});

// ── Topic detail with resources and student progress ─────────────────────────
router.get("/:subjectSlug/topics/:topicSlug", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const topic = await prisma.topic.findFirst({
      where: { slug: req.params.topicSlug, subject: { slug: req.params.subjectSlug, status: "PUBLISHED" } },
      include: {
        subject: { select: { id: true, name: true, slug: true } },
        subtopics: { include: { resources: { where: { status: "PUBLISHED" } } } },
        resources: { where: { status: "PUBLISHED" }, orderBy: { title: "asc" } },
        problemTopics: { include: { problem: { select: { id: true, slug: true, title: true, difficulty: true, status: true } } } },
        _count: { select: { questions: true } },
      },
    });
    if (!topic) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Topic not found." } });

    const pid = await profileId(req.auth.sub);
    const progress = await prisma.learningProgress.findMany({
      where: { studentProfileId: pid, topicId: topic.id },
      select: { resourceId: true, status: true, percent: true, lastActivityAt: true },
    });

    res.json({
      data: {
        ...topic,
        problemTopics: topic.problemTopics
          .filter(({ problem }) => problem.status === "PUBLISHED")
          .map(({ problem }) => problem),
      },
      progress,
    });
  } catch (error) { next(error); }
});

// ── Mark topic as started/completed ─────────────────────────────────────────
router.post("/:subjectSlug/topics/:topicSlug/progress", async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED"]) }).parse(req.body);
    const prisma = getPrisma();
    const topic = await prisma.topic.findFirst({
      where: { slug: req.params.topicSlug, subject: { slug: req.params.subjectSlug, status: "PUBLISHED" } },
      select: { id: true, subjectId: true },
    });
    if (!topic) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Topic not found." } });

    const pid = await profileId(req.auth.sub);
    const percent = input.status === "COMPLETED" ? 100 : 0;
    const lp = await prisma.$transaction(async (tx) => {
      const current = await tx.learningProgress.findFirst({
        where: { studentProfileId: pid, topicId: topic.id, resourceId: null },
        select: { id: true },
      });
      const progressData = { status: input.status, percent, lastActivityAt: new Date() };
      const progress = current
        ? await tx.learningProgress.update({ where: { id: current.id }, data: progressData })
        : await tx.learningProgress.create({
          data: { studentProfileId: pid, topicId: topic.id, resourceId: null, ...progressData },
        });
      await tx.studentActivity.create({
        data: { studentProfileId: pid, activityType: "TOPIC_PROGRESS", topicId: topic.id, metadata: { status: input.status } },
      });
      return progress;
    });
    res.json({ data: lp });
  } catch (error) { next(error); }
});

// ── Admin: seed/create a subject ─────────────────────────────────────────────
const subjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/),
  status: z.enum(["PUBLISHED", "DRAFT"]).default("PUBLISHED"),
});
const topicSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/),
});

router.post("/subjects", async (req, res, next) => {
  try {
    const input = subjectSchema.parse(req.body);
    const subject = await getPrisma().subject.create({ data: input });
    res.status(201).json({ data: subject });
  } catch (error) { next(error); }
});

router.post("/subjects/:subjectId/topics", async (req, res, next) => {
  try {
    const input = topicSchema.parse(req.body);
    const topic = await getPrisma().topic.create({ data: { ...input, subjectId: req.params.subjectId } });
    res.status(201).json({ data: topic });
  } catch (error) { next(error); }
});

// Resource management
router.post("/topics/:topicId/resources", async (req, res, next) => {
  try {
    const input = z.object({
      title: z.string().trim().min(1).max(240),
      kind: z.enum(["VIDEO", "ARTICLE", "NOTES", "PRACTICE", "EXTERNAL"]),
      uri: z.string().url().max(2000).refine((value) => /^https?:\/\//i.test(value), "Resource URLs must use HTTP or HTTPS."),
      subjectId: z.string().uuid().optional(),
      status: z.enum(["PUBLISHED", "DRAFT"]).default("PUBLISHED"),
    }).parse(req.body);
    const resource = await getPrisma().learningResource.create({ data: { ...input, topicId: req.params.topicId } });
    res.status(201).json({ data: resource });
  } catch (error) { next(error); }
});

module.exports = router;
