"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { generateQuestion, evaluateAnswer } = require("./interview-ai");

const router = express.Router();
const configurationSchema = z.object({
  targetRole: z.string().trim().min(2).max(200),
  experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  type: z.enum(["TECHNICAL", "HR", "BEHAVIORAL", "MIXED"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  questionCount: z.coerce.number().int().min(1).max(20),
  durationMinutes: z.coerce.number().int().min(5).max(180),
  topics: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  resumeBased: z.boolean().default(false),
  resumeVersionId: z.string().uuid().nullable().optional(),
  jobDescription: z.string().trim().max(20_000).nullable().optional(),
});

function safeSession(session) {
  return {
    id: session.id,
    type: session.type,
    status: session.status,
    configuration: session.configuration,
    rubricVersion: session.rubricVersion,
    currentSequence: session.currentSequence,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    questions: session.questions?.map((question) => ({
      id: question.id, sequence: question.sequence, text: question.text, topic: question.topic,
      answers: question.answers?.map((answer) => ({ id: answer.id, text: answer.text, submittedAt: answer.submittedAt, durationSeconds: answer.durationSeconds })),
    })),
    evaluations: session.evaluations?.map((evaluation) => ({
      id: evaluation.id, categoryScores: evaluation.categoryScores, overallScore: evaluation.overallScore,
      evidence: evaluation.evidence, status: evaluation.status, createdAt: evaluation.createdAt,
    })),
  };
}

async function ownedSession(id, userId) {
  const session = await getPrisma().interviewSession.findFirst({
    where: { id, createdByUserId: userId },
    include: { questions: { orderBy: { sequence: "asc" }, include: { answers: { orderBy: { submittedAt: "asc" } } } }, evaluations: { orderBy: { createdAt: "desc" } } },
  });
  if (!session) throw Object.assign(new Error("Interview not found."), { status: 404, code: "NOT_FOUND" });
  return session;
}

async function resumeContext(prisma, userId, resumeVersionId) {
  if (!resumeVersionId) return "";
  const version = await prisma.resumeVersion.findFirst({ where: { id: resumeVersionId, resume: { student: { userId }, deletedAt: null } }, select: { id: true, parsedText: true } });
  if (!version) throw Object.assign(new Error("The selected resume version is not owned by this student."), { status: 400, code: "INVALID_RESUME_VERSION" });
  return version.parsedText || "";
}

router.post("/", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const configuration = configurationSchema.parse(req.body);
    if (configuration.resumeBased && !configuration.resumeVersionId) throw Object.assign(new Error("A resume version is required for a resume-based interview."), { status: 400, code: "RESUME_VERSION_REQUIRED" });
    await resumeContext(prisma, req.auth.sub, configuration.resumeVersionId);
    const session = await prisma.interviewSession.create({
      data: {
        type: `AI_${configuration.type}`,
        status: "CONFIGURED",
        createdByUserId: req.auth.sub,
        configuration: { ...configuration, resumeVersionId: configuration.resumeVersionId || null },
        rubricVersion: "AI_INTERVIEW_RUBRIC_V1",
        consentSnapshot: { transcript: true, aiContext: true },
        participants: { create: { userId: req.auth.sub, role: "STUDENT", joinedAt: new Date() } },
      },
    });
    res.status(201).json({ data: safeSession(session) });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const sessions = await getPrisma().interviewSession.findMany({ where: { createdByUserId: req.auth.sub }, orderBy: { startedAt: "desc" }, include: { questions: { select: { id: true } }, evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true } } } });
    res.json({ data: sessions.map((session) => ({ id: session.id, type: session.type, status: session.status, configuration: session.configuration, questionCount: session.questions.length, score: session.evaluations[0]?.overallScore ?? null, createdAt: session.startedAt || session.scheduledAt, completedAt: session.completedAt })) });
  } catch (error) { next(error); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const completed = await getPrisma().interviewSession.findMany({ where: { createdByUserId: req.auth.sub, status: "COMPLETED" }, include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const scores = completed.map((item) => Number(item.evaluations[0]?.overallScore || 0)).filter((score) => score > 0);
    res.json({ data: { totalCompleted: completed.length, averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, recent: completed.slice(0, 5).map((item) => ({ id: item.id, score: Number(item.evaluations[0]?.overallScore || 0), type: item.type, completedAt: item.completedAt })) } });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try { res.json({ data: safeSession(await ownedSession(req.params.id, req.auth.sub)) }); } catch (error) { next(error); }
});

router.post("/:id/start", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const session = await ownedSession(req.params.id, req.auth.sub);
    if (!["CONFIGURED", "READY"].includes(session.status)) throw Object.assign(new Error("This interview cannot be started in its current state."), { status: 409, code: "INVALID_STATE" });
    const configuration = session.configuration;
    const resumeText = await resumeContext(prisma, req.auth.sub, configuration.resumeVersionId);
    const generated = await generateQuestion({ configuration, sequence: 1, resumeText });
    await prisma.$transaction(async (tx) => {
      await tx.interviewQuestion.create({ data: { sessionId: session.id, sequence: 1, text: generated.question.text, topic: generated.question.topic, generatedBy: generated.provider, promptVersion: "AI_INTERVIEW_PROMPT_V1" } });
      await tx.interviewSession.update({ where: { id: session.id }, data: { status: "IN_PROGRESS", startedAt: new Date(), currentSequence: 1 } });
    });
    res.status(202).json({ data: safeSession(await ownedSession(session.id, req.auth.sub)) });
  } catch (error) { next(error); }
});

router.post("/:id/answers", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const session = await ownedSession(req.params.id, req.auth.sub);
    if (session.status !== "IN_PROGRESS") throw Object.assign(new Error("This interview is not accepting answers."), { status: 409, code: "INVALID_STATE" });
    const input = z.object({ questionId: z.string().uuid(), text: z.string().trim().min(1).max(10_000), durationSeconds: z.number().int().min(0).max(86_400).optional(), complete: z.boolean().default(false) }).parse(req.body);
    const question = session.questions.find((item) => item.id === input.questionId);
    if (!question) throw Object.assign(new Error("Question does not belong to this interview."), { status: 400, code: "INVALID_QUESTION" });
    if (question.answers.length) throw Object.assign(new Error("This question has already been answered."), { status: 409, code: "DUPLICATE_ANSWER" });
    const result = await evaluateAnswer({ answer: input.text, configuration: session.configuration });
    const nextSequence = session.currentSequence + 1;
    const resumeText = await resumeContext(prisma, req.auth.sub, session.configuration.resumeVersionId);
    const next = input.complete || nextSequence > session.configuration.questionCount
      ? null
      : await generateQuestion({ configuration: session.configuration, sequence: nextSequence, resumeText });
    await prisma.$transaction(async (tx) => {
      await tx.interviewAnswer.create({ data: { questionId: question.id, participantUserId: req.auth.sub, text: input.text, durationSeconds: input.durationSeconds } });
      await tx.interviewEvaluation.create({ data: { sessionId: session.id, evaluatorUserId: req.auth.sub, modelAlias: result.modelAlias, rubricVersion: "AI_INTERVIEW_RUBRIC_V1", categoryScores: result.evaluation.categoryScores, overallScore: result.evaluation.overallScore, evidence: { ...result.evaluation, provider: result.provider }, status: "COMPLETE" } });
      if (input.complete || nextSequence > session.configuration.questionCount) await tx.interviewSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date(), currentSequence: session.currentSequence } });
      else {
        await tx.interviewQuestion.create({ data: { sessionId: session.id, sequence: nextSequence, text: next.question.text, topic: next.question.topic, generatedBy: next.provider, promptVersion: "AI_INTERVIEW_PROMPT_V1" } });
        await tx.interviewSession.update({ where: { id: session.id }, data: { currentSequence: nextSequence } });
      }
    });
    res.status(201).json({ data: safeSession(await ownedSession(session.id, req.auth.sub)) });
  } catch (error) { next(error); }
});

router.post("/:id/complete", async (req, res, next) => {
  try {
    const session = await ownedSession(req.params.id, req.auth.sub);
    if (session.status === "COMPLETED") return res.json({ data: safeSession(session) });
    if (!["IN_PROGRESS", "READY"].includes(session.status)) throw Object.assign(new Error("This interview cannot be completed."), { status: 409, code: "INVALID_STATE" });
    const updated = await getPrisma().interviewSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    res.json({ data: safeSession(updated) });
  } catch (error) { next(error); }
});

module.exports = router;
