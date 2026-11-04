"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const studentRouter = express.Router();
const adminRouter = express.Router();

const roleFields = {
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(5000).nullable().optional(),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).max(100),
  dsaRequirements: z.record(z.string(), z.unknown()),
  coreSubjects: z.array(z.string().trim().min(1).max(120)).max(50),
  languages: z.array(z.string().trim().min(1).max(80)).max(50),
  status: z.enum(["PUBLISHED", "DRAFT"]),
};

const selectionSchema = z.object({
  roleSlug: z.string().trim().min(2).max(200),
  isPrimary: z.boolean().optional(),
  goalDate: z.coerce.date().nullable().optional(),
});

async function setPrimary(tx, userId, roleId, goalDate) {
  await tx.studentTargetRole.updateMany({ where: { userId }, data: { isPrimary: false } });
  return tx.studentTargetRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: { isPrimary: true, ...(goalDate !== undefined ? { goalDate } : {}) },
    create: { userId, roleId, isPrimary: true, goalDate: goalDate || null },
    include: { role: true },
  });
}

studentRouter.get("/", async (_req, res, next) => {
  try {
    const roles = await getPrisma().targetRole.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
    });
    res.json({ data: roles });
  } catch (error) { next(error); }
});

studentRouter.get("/mine", async (req, res, next) => {
  try {
    const selections = await getPrisma().studentTargetRole.findMany({
      where: { userId: req.auth.sub, role: { status: "PUBLISHED" } },
      include: { role: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    res.json({ data: selections });
  } catch (error) { next(error); }
});

studentRouter.get("/mine/:slug/readiness", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const selection = await prisma.studentTargetRole.findFirst({
      where: { userId: req.auth.sub, role: { slug: req.params.slug, status: "PUBLISHED" } },
      include: { role: true },
    });
    if (!selection) return res.status(404).json({ error: { code: "ROLE_NOT_SELECTED", message: "That target role is not selected." } });

    const profileId = await prisma.studentProfile.findUnique({
      where: { userId: req.auth.sub },
      select: { id: true },
    });
    if (!profileId) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Student profile was not found." } });

    const [skills, projects, solvedProblems, attempts] = await Promise.all([
      prisma.studentSkill.findMany({
        where: { studentId: profileId.id },
        include: { skill: { select: { name: true } } },
      }),
      prisma.project.findMany({
        where: { studentId: profileId.id },
        select: { id: true, name: true, technologies: true },
      }),
      prisma.studentProblemProgress.findMany({
        where: { userId: req.auth.sub, status: "SOLVED" },
        select: { problem: { select: { title: true, topics: { select: { topic: { select: { name: true } } } } } } },
      }),
      prisma.assessmentAttempt.findMany({
        where: { userId: req.auth.sub, status: { in: ["GRADED", "EXPIRED"] } },
        orderBy: { submittedAt: "desc" },
        take: 100,
        select: {
          result: { select: { topicBreakdown: true } },
          assignment: {
            select: {
              assessment: {
                select: {
                  questions: {
                    select: {
                      question: {
                        select: {
                          topicId: true,
                          topic: { select: { name: true, subject: { select: { name: true } } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const normalize = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const verifiedSkillNames = new Set(skills
      .filter((item) => item.evidenceType === "RECRUITER_VERIFIED" || item.verifiedAt)
      .map((item) => normalize(item.skill.name)));
    const selfReportedSkillNames = new Set(skills
      .filter((item) => !item.verifiedAt && item.evidenceType !== "RECRUITER_VERIFIED")
      .map((item) => normalize(item.skill.name)));
    const projectTechnologies = new Set(projects.flatMap((project) => Array.isArray(project.technologies) ? project.technologies.map(normalize) : []));
    const codingTopicNames = new Map();
    for (const progress of solvedProblems) {
      for (const { topic } of progress.problem.topics) codingTopicNames.set(normalize(topic.name), topic.name);
    }
    const codingTopics = new Set(codingTopicNames.keys());
    const codingTitles = solvedProblems.map(({ problem }) => problem.title);
    const subjectAssessmentEvidence = new Map();
    for (const attempt of attempts) {
      if (!attempt.result || !attempt.result.topicBreakdown || typeof attempt.result.topicBreakdown !== "object") continue;
      const topicsById = new Map();
      for (const link of attempt.assignment.assessment.questions) {
        const topic = link.question.topic;
        if (link.question.topicId && topic) topicsById.set(link.question.topicId, topic);
      }
      for (const [topicId, result] of Object.entries(attempt.result.topicBreakdown)) {
        const topic = topicsById.get(topicId);
        const total = Number(result?.total || 0);
        const correct = Number(result?.correct || 0);
        if (!topic || !Number.isFinite(total) || !Number.isFinite(correct) || total <= 0) continue;
        for (const name of [topic.name, topic.subject?.name].filter(Boolean)) {
          const key = normalize(name);
          const current = subjectAssessmentEvidence.get(key) || { correct: 0, total: 0, attempts: 0 };
          current.correct += correct;
          current.total += total;
          current.attempts += 1;
          subjectAssessmentEvidence.set(key, current);
        }
      }
    }

    const requiredSkills = Array.isArray(selection.role.requiredSkills) ? selection.role.requiredSkills : [];
    const coreSubjects = Array.isArray(selection.role.coreSubjects) ? selection.role.coreSubjects : [];
    const skillReport = requiredSkills.map((name) => {
      const key = normalize(name);
      const evidence = [];
      if (verifiedSkillNames.has(key)) evidence.push({ type: "verified-skill", label: `Verified skill profile entry: ${name}` });
      if (codingTopics.has(key)) evidence.push({ type: "coding", label: `Solved coding problems tagged ${name}`, count: solvedProblems.filter(({ problem }) => problem.topics.some(({ topic }) => normalize(topic.name) === key)).length });
      if (subjectAssessmentEvidence.has(key)) {
        const assessment = subjectAssessmentEvidence.get(key);
        evidence.push({ type: "assessment", label: `Graded assessment evidence: ${name}`, accuracy: Math.round((assessment.correct / assessment.total) * 100), questions: assessment.total });
      }
      if (projectTechnologies.has(key)) evidence.push({ type: "project", label: `Project profile lists ${name}; not independently verified` });
      const selfReported = selfReportedSkillNames.has(key);
      return {
        name,
        status: evidence.some(({ type }) => type !== "project") ? "EVIDENCE_AVAILABLE" : selfReported ? "SELF_REPORTED_ONLY" : evidence.length ? "PROFILE_EVIDENCE_ONLY" : "MISSING_EVIDENCE",
        evidence,
      };
    });
    const subjectReport = coreSubjects.map((name) => {
      const result = subjectAssessmentEvidence.get(normalize(name));
      return {
        name,
        status: result ? "MEASURED" : "NO_ASSESSMENT_EVIDENCE",
        ...(result ? { accuracy: Math.round((result.correct / result.total) * 100), questions: result.total, attempts: result.attempts } : {}),
      };
    });
    const measuredCount = skillReport.filter((item) => item.status === "EVIDENCE_AVAILABLE").length
      + subjectReport.filter((item) => item.status === "MEASURED").length;
    const requirementCount = skillReport.length + subjectReport.length;

    res.json({
      data: {
        role: { slug: selection.role.slug, name: selection.role.name },
        generatedAt: new Date().toISOString(),
        coverage: {
          measured: measuredCount,
          total: requirementCount,
          percent: requirementCount ? Math.round((measuredCount / requirementCount) * 100) : null,
          definition: "Percentage of required skills and core subjects with linked coding, graded-assessment, or verified-skill evidence. It is not a proficiency or hiring prediction.",
        },
        requiredSkills: skillReport,
        coreSubjects: subjectReport,
        dsa: {
          solvedProblems: solvedProblems.length,
          byTopic: [...codingTopics].map((topic) => ({ topic: codingTopicNames.get(topic), solved: solvedProblems.filter(({ problem }) => problem.topics.some(({ topic: problemTopic }) => normalize(problemTopic.name) === topic)).length })),
          configuredRequirements: selection.role.dsaRequirements,
          status: Object.keys(selection.role.dsaRequirements || {}).length ? "REQUIREMENTS_CONFIGURED" : "REQUIREMENTS_NOT_CONFIGURED",
          problemTitles: codingTitles.slice(0, 20),
        },
        projects: { profileEntries: projects.length, status: projects.length ? "PROFILE_EVIDENCE" : "NO_PROJECTS_RECORDED" },
        evidenceLimits: [
          "Self-reported skills do not count as measured coverage.",
          "Project technologies are shown as unverified profile evidence and do not satisfy measured coverage.",
          "Readiness coverage is not a guarantee of placement or hiring success.",
        ],
      },
    });
  } catch (error) { next(error); }
});

studentRouter.post("/mine", async (req, res, next) => {
  try {
    const input = selectionSchema.parse(req.body);
    const prisma = getPrisma();
    const role = await prisma.targetRole.findFirst({ where: { slug: input.roleSlug, status: "PUBLISHED" }, select: { id: true } });
    if (!role) return res.status(404).json({ error: { code: "ROLE_NOT_FOUND", message: "Target role was not found." } });

    const userId = req.auth.sub;
    const shouldBePrimary = input.isPrimary === true || await prisma.studentTargetRole.count({ where: { userId } }) === 0;
    const selection = await prisma.$transaction(async (tx) => {
      if (shouldBePrimary) return setPrimary(tx, userId, role.id, input.goalDate);
      return tx.studentTargetRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: { ...(input.goalDate !== undefined ? { goalDate: input.goalDate } : {}) },
        create: { userId, roleId: role.id, isPrimary: false, goalDate: input.goalDate || null },
        include: { role: true },
      });
    });
    res.status(201).json({ data: selection });
  } catch (error) { next(error); }
});

studentRouter.patch("/mine/:slug", async (req, res, next) => {
  try {
    const input = z.object({ isPrimary: z.boolean().optional(), goalDate: z.coerce.date().nullable().optional() }).refine((value) => Object.keys(value).length > 0).parse(req.body);
    const prisma = getPrisma();
    const userId = req.auth.sub;
    const selection = await prisma.studentTargetRole.findFirst({
      where: { userId, role: { slug: req.params.slug, status: "PUBLISHED" } },
      include: { role: true },
    });
    if (!selection) return res.status(404).json({ error: { code: "ROLE_NOT_SELECTED", message: "That target role is not selected." } });

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) return setPrimary(tx, userId, selection.roleId, input.goalDate);
      if (input.isPrimary === false) {
        await tx.studentTargetRole.updateMany({ where: { userId, roleId: selection.roleId }, data: { isPrimary: false } });
      }
      return tx.studentTargetRole.update({
        where: { userId_roleId: { userId, roleId: selection.roleId } },
        data: input.goalDate !== undefined ? { goalDate: input.goalDate } : {},
        include: { role: true },
      });
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

studentRouter.delete("/mine/:slug", async (req, res, next) => {
  try {
    const removed = await getPrisma().studentTargetRole.deleteMany({
      where: { userId: req.auth.sub, role: { slug: req.params.slug } },
    });
    if (!removed.count) return res.status(404).json({ error: { code: "ROLE_NOT_SELECTED", message: "That target role is not selected." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

adminRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ data: await getPrisma().targetRole.findMany({ orderBy: { name: "asc" } }) });
  } catch (error) { next(error); }
});

adminRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      ...roleFields,
      requiredSkills: roleFields.requiredSkills.default([]),
      dsaRequirements: roleFields.dsaRequirements.default({}),
      coreSubjects: roleFields.coreSubjects.default([]),
      languages: roleFields.languages.default([]),
      status: roleFields.status.default("PUBLISHED"),
    }).parse(req.body);
    const role = await getPrisma().targetRole.create({ data: input });
    res.status(201).json({ data: role });
  } catch (error) { next(error); }
});

adminRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = z.object(roleFields).partial().refine((value) => Object.keys(value).length > 0).parse(req.body);
    const result = await getPrisma().targetRole.updateMany({ where: { id: req.params.id }, data: input });
    if (!result.count) return res.status(404).json({ error: { code: "ROLE_NOT_FOUND", message: "Target role was not found." } });
    res.json({ data: await getPrisma().targetRole.findUnique({ where: { id: req.params.id } }) });
  } catch (error) { next(error); }
});

module.exports = { studentRouter, adminRouter };
