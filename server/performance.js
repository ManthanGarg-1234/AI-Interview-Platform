"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();
const planSchema = z.object({
  targetRole: z.string().trim().min(2).max(200),
  deadline: z.coerce.date().nullable().optional(),
  dailyMinutes: z.number().int().min(15).max(720),
  goals: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
});

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

async function profileFor(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "PROFILE_NOT_FOUND" });
  return profile.id;
}

async function performance(userId) {
  const prisma = getPrisma();
  const profileId = await profileFor(userId);
  const [resume, coding, submissions, interviews, assessments, activities, skills] = await Promise.all([
    prisma.resumeAnalysis.findMany({ where: { resumeVersion: { resume: { student: { userId } } } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, score: true, status: true, targetRole: true, createdAt: true, findings: true } }),
    prisma.studentProblemProgress.findMany({ where: { userId }, include: { problem: { select: { difficulty: true, title: true } } } }),
    prisma.codeSubmission.findMany({ where: { userId }, select: { verdict: true, createdAt: true } }),
    prisma.interviewSession.findMany({ where: { createdByUserId: userId, status: "COMPLETED" }, include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true, categoryScores: true } } } }),
    prisma.assessmentAttempt.findMany({ where: { userId, status: { in: ["GRADED", "SUBMITTED", "EXPIRED"] } }, include: { result: true, assignment: { include: { assessment: { select: { type: true, title: true } } } } } }),
    prisma.studentActivity.findMany({ where: { studentProfileId: profileId }, orderBy: { occurredAt: "desc" }, take: 50, include: { topic: { select: { name: true } } } }),
    prisma.studentSkill.findMany({ where: { studentId: profileId }, include: { skill: { select: { name: true, category: true } } } }),
  ]);
  const accepted = submissions.filter((item) => item.verdict === "ACCEPTED").length;
  const codingSolved = coding.filter((item) => item.status === "SOLVED");
  const interviewScores = interviews.flatMap((item) => item.evaluations.map((evaluation) => Number(evaluation.overallScore || 0)));
  const assessmentScores = assessments.map((item) => Number(item.score || 0)).filter((score) => score > 0);
  const assessmentCorrect = assessments.reduce((sum, item) => sum + (item.result?.correctCount || 0), 0);
  const assessmentQuestions = assessments.reduce((sum, item) => sum + (item.result?.correctCount || 0) + (item.result?.incorrectCount || 0) + (item.result?.unattemptedCount || 0), 0);
  return {
    resume: { latestScore: resume[0]?.score == null ? null : Number(resume[0].score), history: resume.map((item) => ({ id: item.id, score: item.score == null ? null : Number(item.score), status: item.status, targetRole: item.targetRole, createdAt: item.createdAt, missingKeywords: item.findings?.missingKeywords || [] })) },
    coding: { attempted: coding.length, solved: codingSolved.length, byDifficulty: codingSolved.reduce((result, item) => { result[item.problem.difficulty] = (result[item.problem.difficulty] || 0) + 1; return result; }, {}), acceptanceRate: submissions.length ? Math.round((accepted / submissions.length) * 100) : null, submissions: submissions.length },
    interviews: { completed: interviews.length, averageScore: average(interviewScores), recent: interviewScores.slice(0, 5) },
    assessments: { attempted: assessments.length, averageScore: average(assessmentScores), accuracy: assessmentQuestions ? Math.round((assessmentCorrect / assessmentQuestions) * 100) : null, correct: assessmentCorrect, questions: assessmentQuestions },
    skills: skills.map((item) => ({ name: item.skill.name, category: item.skill.category, proficiency: item.proficiency == null ? null : Number(item.proficiency), evidenceType: item.evidenceType })),
    activities: activities.map((item) => ({ id: item.id, type: item.activityType, occurredAt: item.occurredAt, topic: item.topic?.name || null, metadata: item.metadata })),
  };
}

router.get("/performance", async (req, res, next) => {
  try { res.json({ data: await performance(req.auth.sub) }); } catch (error) { next(error); }
});

router.get("/activities", async (req, res, next) => {
  try {
    const profileId = await profileFor(req.auth.sub);
    const activities = await getPrisma().studentActivity.findMany({ where: { studentProfileId: profileId }, orderBy: { occurredAt: "desc" }, take: Math.min(Number(req.query.limit) || 50, 100), include: { topic: { select: { name: true } } } });
    res.json({ data: activities.map((item) => ({ id: item.id, type: item.activityType, occurredAt: item.occurredAt, topic: item.topic?.name || null, metadata: item.metadata })) });
  } catch (error) { next(error); }
});

router.get("/resources", async (req, res, next) => {
  try {
    const resources = await getPrisma().learningResource.findMany({ where: { status: "PUBLISHED", ...(req.query.topicId ? { topicId: String(req.query.topicId) } : {}), ...(req.query.subjectId ? { subjectId: String(req.query.subjectId) } : {}), ...(req.query.search ? { title: { contains: String(req.query.search), mode: "insensitive" } } : {}) }, orderBy: { title: "asc" }, take: 100, include: { topic: { select: { name: true } }, subject: { select: { name: true } } } });
    res.json({ data: resources });
  } catch (error) { next(error); }
});

router.post("/resources/:id/progress", async (req, res, next) => {
  try {
    const input = z.object({ percent: z.number().min(0).max(100) }).parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const resource = await getPrisma().learningResource.findFirst({ where: { id: req.params.id, status: "PUBLISHED" } });
    if (!resource) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
    const progress = await getPrisma().learningProgress.upsert({ where: { studentProfileId_resourceId_topicId: { studentProfileId: profileId, resourceId: resource.id, topicId: resource.topicId } }, update: { percent: input.percent, status: input.percent >= 100 ? "COMPLETED" : "IN_PROGRESS", lastActivityAt: new Date() }, create: { studentProfileId: profileId, resourceId: resource.id, topicId: resource.topicId, percent: input.percent, status: input.percent >= 100 ? "COMPLETED" : "IN_PROGRESS" } });
    res.json({ data: progress });
  } catch (error) { next(error); }
});

router.post("/plans", async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const plan = await getPrisma().studyPlan.create({ data: { studentProfileId: profileId, targetRole: input.targetRole, deadline: input.deadline || null, dailyMinutes: input.dailyMinutes, goals: { create: input.goals.map((title, index) => ({ title, priority: index === 0 ? "HIGH" : "MEDIUM", status: "OPEN" })) } } });
    const goals = await getPrisma().studyGoal.findMany({ where: { studyPlanId: plan.id }, orderBy: { id: "asc" } });
    await getPrisma().studyTask.createMany({ data: goals.map((goal, index) => ({ studyPlanId: plan.id, goalId: goal.id, title: `Practice: ${goal.title}`, dueAt: new Date(Date.now() + (index + 1) * 86400000), priority: goal.priority, status: "OPEN", source: "STUDENT_GOAL" })) });
    res.status(201).json({ data: await getPrisma().studyPlan.findUnique({ where: { id: plan.id }, include: { goals: true, tasks: true } }) });
  } catch (error) { next(error); }
});

router.get("/plans", async (req, res, next) => {
  try { const profileId = await profileFor(req.auth.sub); res.json({ data: await getPrisma().studyPlan.findMany({ where: { studentProfileId: profileId }, orderBy: { updatedAt: "desc" }, include: { goals: true, tasks: { include: { completions: true }, orderBy: { dueAt: "asc" } } } }) }); } catch (error) { next(error); }
});

router.post("/plans/:planId/tasks/:taskId/complete", async (req, res, next) => {
  try {
    const profileId = await profileFor(req.auth.sub);
    const task = await getPrisma().studyTask.findFirst({ where: { id: req.params.taskId, studyPlanId: req.params.planId, plan: { studentProfileId: profileId } } });
    if (!task) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study task not found." } });
    const completion = await getPrisma().studyTaskCompletion.upsert({ where: { taskId_completedByUserId: { taskId: task.id, completedByUserId: req.auth.sub } }, update: { completedAt: new Date() }, create: { taskId: task.id, completedByUserId: req.auth.sub } });
    await getPrisma().studyTask.update({ where: { id: task.id }, data: { status: "COMPLETED" } });
    res.json({ data: completion });
  } catch (error) { next(error); }
});

async function mentorReply(message, context) {
  if (!process.env.LLM_API_URL || !process.env.LLM_API_KEY) return { text: `Local mentor suggestion: focus on the evidence-backed gaps in your dashboard. Start with ${context.weakestTopic || "one weak topic"} and practice a small, measurable task today.`, provider: "mock", modelAlias: "local-mentor-v1" };
  const response = await fetch(process.env.LLM_API_URL, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` }, body: JSON.stringify({ model: process.env.LLM_MODEL || "mentor", response_format: { type: "json_object" }, messages: [{ role: "system", content: "Return JSON with one string field text. Give safe educational guidance. Never modify official scores or invent student history." }, { role: "user", content: JSON.stringify({ message, context }) }] }) });
  if (!response.ok) throw Object.assign(new Error("Configured AI provider returned an error."), { code: "AI_PROVIDER_FAILED" });
  const body = await response.json(); const raw = body.output || body.choices?.[0]?.message?.content; const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { text: z.object({ text: z.string().min(1).max(5000) }).parse(parsed).text, provider: process.env.LLM_PROVIDER || "configured", modelAlias: process.env.LLM_MODEL || "configured-model" };
}

router.post("/mentor/conversations", async (req, res, next) => {
  try {
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(req.body);
    const context = await performance(req.auth.sub);
    const conversation = await getPrisma().aiConversation.create({ data: { userId: req.auth.sub, subject: "Student mentor", topic: "Performance", messages: { create: { role: "USER", content: input.message } } }, include: { messages: true } });
    const reply = await mentorReply(input.message, { weakestTopic: context.assessments.accuracy != null && context.assessments.accuracy < 60 ? "assessment accuracy" : "consistent practice", performance: { coding: context.coding, interviews: context.interviews, assessments: context.assessments } });
    const assistant = await getPrisma().aiMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.text, modelAlias: reply.modelAlias } });
    res.status(201).json({ data: { id: conversation.id, provider: reply.provider, messages: [conversation.messages[0], assistant] } });
  } catch (error) { next(error); }
});

router.get("/mentor/conversations", async (req, res, next) => {
  try { res.json({ data: await getPrisma().aIConversation.findMany({ where: { userId: req.auth.sub }, orderBy: { lastMessageAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } } }) }); } catch (error) { next(error); }
});

module.exports = router;
