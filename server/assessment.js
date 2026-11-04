"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();
const answerSchema = z.union([z.string().max(10_000), z.array(z.string().max(200)).max(100), z.boolean(), z.number()]);

function publicQuestion(link, includeExplanation = false) {
  const question = link.question;
  return {
    id: question.id, sequence: link.sequence, body: question.body, type: question.type,
    difficulty: question.difficulty, points: Number(link.points), required: link.required,
    options: question.options.map(({ id, label, value, sequence }) => ({ id, label, value, sequence })),
    ...(includeExplanation ? { explanation: question.explanation, answerKey: question.answerKey } : {}),
  };
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return value.map(String).sort();
  return String(value).trim().toLowerCase();
}

function scoreAnswer(question, answer, points, negativeMarking) {
  const expected = normalizeAnswer(question.answerKey);
  const actual = normalizeAnswer(answer);
  const correct = JSON.stringify(expected) === JSON.stringify(actual);
  if (correct) return { correct: true, points };
  if (question.type === "MULTIPLE_CORRECT" && Array.isArray(question.answerKey) && Array.isArray(answer)) {
    const expectedSet = new Set(question.answerKey.map(String));
    const actualSet = new Set(answer.map(String));
    const overlap = [...actualSet].filter((value) => expectedSet.has(value)).length;
    const partial = expectedSet.size ? Math.max(0, (overlap / expectedSet.size) * points) : 0;
    return { correct: false, points: partial - Number(negativeMarking || 0) };
  }
  return { correct: false, points: -Number(negativeMarking || 0) };
}

async function loadAttempt(prisma, id, userId, includeAnswers = true) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id, userId },
    include: {
      assignment: { include: { assessment: { include: { questions: { orderBy: { sequence: "asc" }, include: { question: { include: { options: { orderBy: { sequence: "asc" } } } } } } } } } },
      ...(includeAnswers ? { answers: true, result: true } : {}),
    },
  });
  if (!attempt) throw Object.assign(new Error("Assessment attempt not found."), { status: 404, code: "NOT_FOUND" });
  return attempt;
}

function activeAttemptResponse(attempt) {
  const assessment = attempt.assignment.assessment;
  return {
    id: attempt.id, status: attempt.status, attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt, expiresAt: attempt.expiresAt,
    assessment: { id: assessment.id, title: assessment.title, type: assessment.type, durationSeconds: assessment.durationSeconds },
    questions: assessment.questions.map((link) => publicQuestion(link)),
    answers: (attempt.answers || []).map((answer) => ({ questionId: answer.questionId, answer: answer.answer, answeredAt: answer.answeredAt })),
  };
}

async function ensureActive(attempt) {
  if (attempt.status !== "IN_PROGRESS") throw Object.assign(new Error("This assessment attempt is not active."), { status: 409, code: "INVALID_STATE" });
  if (attempt.expiresAt && attempt.expiresAt <= new Date()) {
    await getPrisma().assessmentAttempt.update({ where: { id: attempt.id }, data: { status: "EXPIRED", submittedAt: new Date() } });
    throw Object.assign(new Error("The assessment deadline has passed."), { status: 409, code: "ASSESSMENT_EXPIRED" });
  }
}

router.get("/", async (req, res, next) => {
  try {
    const assessments = await getPrisma().assessment.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, include: { questions: { select: { questionId: true, points: true } } } });
    res.json({ data: assessments.map((assessment) => ({ id: assessment.id, title: assessment.title, type: assessment.type, durationSeconds: assessment.durationSeconds, maxAttempts: assessment.maxAttempts, questionCount: assessment.questions.length, totalMarks: assessment.questions.reduce((sum, item) => sum + Number(item.points), 0) })) });
  } catch (error) { next(error); }
});

router.get("/assignments", async (req, res, next) => {
  try {
    const assignments = await getPrisma().assessmentAssignment.findMany({ where: { studentUserId: req.auth.sub }, orderBy: { dueAt: "asc" }, include: { assessment: { select: { id: true, title: true, type: true, durationSeconds: true } }, attempts: { orderBy: { attemptNumber: "desc" }, take: 1, select: { id: true, status: true, score: true } } } });
    res.json({ data: assignments.map((item) => ({ id: item.id, assessment: item.assessment, startsAt: item.startsAt, dueAt: item.dueAt, status: item.status, latestAttempt: item.attempts[0] || null })) });
  } catch (error) { next(error); }
});

router.get("/attempts", async (req, res, next) => {
  try {
    const attempts = await getPrisma().assessmentAttempt.findMany({ where: { userId: req.auth.sub }, orderBy: { startedAt: "desc" }, include: { assignment: { include: { assessment: { select: { id: true, title: true, type: true } } } }, result: true } });
    res.json({ data: attempts.map((attempt) => ({ id: attempt.id, status: attempt.status, score: attempt.score, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, assessment: attempt.assignment.assessment, result: attempt.result })) });
  } catch (error) { next(error); }
});

router.post("/:assessmentId/attempts", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const assessment = await prisma.assessment.findFirst({ where: { id: req.params.assessmentId, status: "PUBLISHED" }, include: { questions: { select: { questionId: true } } } });
    if (!assessment) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Published assessment not found." } });
    const assignment = await prisma.assessmentAssignment.findFirst({ where: { assessmentId: assessment.id, studentUserId: req.auth.sub }, orderBy: { createdAt: "desc" } });
    if (!assignment && (assessment.type === "RECRUITER" || assessment.ownerCompanyId)) {
      return res.status(403).json({ error: { code: "ASSESSMENT_ASSIGNMENT_REQUIRED", message: "This assessment is available only to assigned candidates." } });
    }
    const targetAssignment = assignment || await prisma.assessmentAssignment.create({ data: { assessmentId: assessment.id, studentUserId: req.auth.sub, assignedByUserId: assessment.createdByUserId, status: "IN_PROGRESS" } });
    if (targetAssignment.startsAt && targetAssignment.startsAt > new Date()) throw Object.assign(new Error("This assessment is not available yet."), { status: 409, code: "ASSESSMENT_NOT_AVAILABLE" });
    if (targetAssignment.dueAt && targetAssignment.dueAt <= new Date()) throw Object.assign(new Error("This assessment assignment has expired."), { status: 409, code: "ASSESSMENT_EXPIRED" });
    const count = await prisma.assessmentAttempt.count({ where: { assignmentId: targetAssignment.id, userId: req.auth.sub } });
    if (count >= assessment.maxAttempts) throw Object.assign(new Error("The maximum number of attempts has been reached."), { status: 409, code: "ATTEMPT_LIMIT_REACHED" });
    const active = await prisma.assessmentAttempt.findFirst({ where: { assignmentId: targetAssignment.id, userId: req.auth.sub, status: "IN_PROGRESS" } });
    if (active) return res.status(200).json({ data: activeAttemptResponse(await loadAttempt(prisma, active.id, req.auth.sub)) });
    const started = new Date();
    const durationDeadline = new Date(started.getTime() + assessment.durationSeconds * 1000);
    const expiresAt = targetAssignment.dueAt && targetAssignment.dueAt < durationDeadline ? targetAssignment.dueAt : durationDeadline;
    const attempt = await prisma.assessmentAttempt.create({ data: { assignmentId: targetAssignment.id, userId: req.auth.sub, attemptNumber: count + 1, status: "IN_PROGRESS", startedAt: started, expiresAt } });
    res.status(201).json({ data: activeAttemptResponse(await loadAttempt(prisma, attempt.id, req.auth.sub)) });
  } catch (error) { next(error); }
});

router.get("/attempts/:id", async (req, res, next) => {
  try {
    const attempt = await loadAttempt(getPrisma(), req.params.id, req.auth.sub);
    if (attempt.status === "IN_PROGRESS") {
      try { await ensureActive(attempt); } catch (error) { if (error.code !== "ASSESSMENT_EXPIRED") throw error; }
    }
    res.json({ data: attempt.status === "IN_PROGRESS" ? activeAttemptResponse(attempt) : { ...activeAttemptResponse(attempt), result: attempt.result, questions: attempt.assignment.assessment.questions.map((link) => publicQuestion(link, true)) } });
  } catch (error) { next(error); }
});

router.put("/attempts/:id/answers/:questionId", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const attempt = await loadAttempt(prisma, req.params.id, req.auth.sub);
    await ensureActive(attempt);
    const answer = answerSchema.parse(req.body.answer);
    const link = attempt.assignment.assessment.questions.find((item) => item.questionId === req.params.questionId);
    if (!link) throw Object.assign(new Error("Question does not belong to this attempt."), { status: 400, code: "INVALID_QUESTION" });
    const saved = await prisma.assessmentAnswer.upsert({ where: { attemptId_questionId: { attemptId: attempt.id, questionId: link.questionId } }, update: { answer, answeredAt: new Date() }, create: { attemptId: attempt.id, questionId: link.questionId, answer } });
    res.json({ data: { questionId: saved.questionId, answer: saved.answer, answeredAt: saved.answeredAt } });
  } catch (error) { next(error); }
});

router.post("/attempts/:id/submit", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const attempt = await loadAttempt(prisma, req.params.id, req.auth.sub);
    if (["SUBMITTED", "GRADED", "EXPIRED"].includes(attempt.status)) return res.json({ data: { id: attempt.id, status: attempt.status, result: attempt.result } });
    if (attempt.status !== "IN_PROGRESS") throw Object.assign(new Error("This attempt cannot be submitted."), { status: 409, code: "INVALID_STATE" });
    const expired = attempt.expiresAt && attempt.expiresAt <= new Date();
    const answers = attempt.answers || [];
    const scored = attempt.assignment.assessment.questions.map((link) => {
      const submitted = answers.find((answer) => answer.questionId === link.questionId);
      if (!submitted) return { link, submitted: null, correct: false, points: 0 };
      const result = scoreAnswer(link.question, submitted.answer, Number(link.points), attempt.assignment.assessment.negativeMarking);
      return { link, submitted, ...result };
    });
    const correctCount = scored.filter((item) => item.correct).length;
    const incorrectCount = scored.filter((item) => item.submitted && !item.correct).length;
    const unattemptedCount = scored.filter((item) => !item.submitted).length;
    const score = scored.reduce((sum, item) => sum + item.points, 0);
    const topicBreakdown = scored.reduce((result, item) => { const topic = item.link.question.topicId || "general"; result[topic] = { score: (result[topic]?.score || 0) + item.points, correct: (result[topic]?.correct || 0) + (item.correct ? 1 : 0), total: (result[topic]?.total || 0) + 1 }; return result; }, {});
    const result = await prisma.$transaction(async (tx) => {
      const savedResult = await tx.assessmentResult.upsert({ where: { attemptId: attempt.id }, update: { correctCount, incorrectCount, unattemptedCount, topicBreakdown, gradedAt: new Date() }, create: { attemptId: attempt.id, correctCount, incorrectCount, unattemptedCount, topicBreakdown } });
      await Promise.all(scored.filter((item) => item.submitted).map((item) => tx.assessmentAnswer.update({ where: { id: item.submitted.id }, data: { isCorrect: item.correct, points: item.points } })));
      await tx.assessmentAttempt.update({ where: { id: attempt.id }, data: { status: expired ? "EXPIRED" : "GRADED", submittedAt: new Date(), score } });
      await tx.assessmentAssignment.update({ where: { id: attempt.assignmentId }, data: { status: expired ? "EXPIRED" : "SUBMITTED" } });
      return savedResult;
    });
    res.status(200).json({ data: { id: attempt.id, status: expired ? "EXPIRED" : "GRADED", score, result } });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.scoreAnswer = scoreAnswer;
module.exports.normalizeAnswer = normalizeAnswer;
