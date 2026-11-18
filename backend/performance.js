"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { generateJson, providerConfig } = require("./llm/provider");

const router = express.Router();
const mentorMessageSchema = z.object({ message: z.string().trim().min(1).max(5000) });
const CAREER_MENTOR_SYSTEM_PROMPT = "You are a career-prep mentor for students. Help with resumes, interviews, coding practice, job search, and platform use. Be concise, accurate, practical, and say when unsure. Stay on topic and politely decline unrelated or harmful requests. Do not claim to be human.";
const mentorRateWindows = new Map();

function mentorRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.auth?.sub || req.ip || "unknown";
  const record = mentorRateWindows.get(key);
  if (!record || record.expiresAt <= now) {
    mentorRateWindows.set(key, { count: 1, expiresAt: now + 60_000 });
    return next();
  }
  record.count += 1;
  if (record.count > 20) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((record.expiresAt - now) / 1000))));
    return res.status(429).json({ error: { code: "RATE_LIMITED", message: "You are sending messages too quickly. Try again in a moment." } });
  }
  next();
}
function redactSensitiveMentorInput(value) {
  return String(value || "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}/g, "[REDACTED_PHONE]")
    .replace(/\b(?:password|passphrase)\s*[:=]\s*\S+/gi, "[REDACTED_PASSWORD]")
    .slice(0, 5000);
}
const planSchema = z.object({
  targetRole: z.string().trim().min(2).max(200),
  deadline: z.coerce.date().nullable().optional(),
  dailyMinutes: z.number().int().min(15).max(720),
  goals: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
});
const taskInputSchema = z.object({
  title: z.string().trim().min(2).max(240),
  dueAt: z.coerce.date().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  goalId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});
const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(240).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one task field must be provided.");

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

async function profileFor(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "PROFILE_NOT_FOUND" });
  return profile.id;
}

async function performance(userId, activityRangeDays = 30) {
  const prisma = getPrisma();
  const profileId = await profileFor(userId);
  const activitySince = new Date(Date.now() - activityRangeDays * 86400000);
  const [resume, coding, interviews, assessments, activities, skills] = await Promise.all([
    prisma.resumeAnalysis.findMany({ where: { resumeVersion: { resume: { student: { userId } } } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, score: true, status: true, targetRole: true, createdAt: true, findings: true } }),
    prisma.sheetProblemProgress.findMany({ where: { userId }, include: { problem: { select: { id: true, canonicalProblemId: true, difficulty: true, title: true } } } }),
    prisma.interviewSession.findMany({ where: { createdByUserId: userId, status: "COMPLETED" }, include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true, categoryScores: true } } } }),
    prisma.assessmentAttempt.findMany({ where: { userId, status: { in: ["GRADED", "SUBMITTED", "EXPIRED"] } }, include: { result: true, assignment: { include: { assessment: { select: { type: true, title: true } } } } } }),
    prisma.studentActivity.findMany({ where: { studentProfileId: profileId, occurredAt: { gte: activitySince } }, orderBy: { occurredAt: "desc" }, take: 500, include: { topic: { select: { name: true } } } }),
    prisma.studentSkill.findMany({ where: { studentId: profileId }, include: { skill: { select: { name: true, category: true } } } }),
  ]);
  const progressRank = { NOT_STARTED: 0, IN_PROGRESS: 1, ATTEMPTED: 1, REVISION_REQUIRED: 2, COMPLETED: 3, SOLVED: 3 };
  const canonicalCoding = new Map();
  for (const item of coding) {
    const key = item.problem.canonicalProblemId || item.problem.id;
    const current = canonicalCoding.get(key);
    if (!current || (progressRank[item.status] || 0) > (progressRank[current.status] || 0)) canonicalCoding.set(key, item);
  }
  const uniqueCoding = [...canonicalCoding.values()];
  const codingSolved = uniqueCoding.filter((item) => ["COMPLETED", "SOLVED"].includes(item.status));
  const codingAttempted = uniqueCoding.filter((item) => item.status !== "NOT_STARTED");
  const interviewScores = interviews.flatMap((item) => item.evaluations.map((evaluation) => Number(evaluation.overallScore || 0)));
  const assessmentScores = assessments.map((item) => Number(item.score || 0)).filter((score) => score > 0);
  const assessmentCorrect = assessments.reduce((sum, item) => sum + (item.result?.correctCount || 0), 0);
  const assessmentQuestions = assessments.reduce((sum, item) => sum + (item.result?.correctCount || 0) + (item.result?.incorrectCount || 0) + (item.result?.unattemptedCount || 0), 0);
  return {
    resume: { latestScore: resume[0]?.score == null ? null : Number(resume[0].score), history: resume.map((item) => ({ id: item.id, score: item.score == null ? null : Number(item.score), status: item.status, targetRole: item.targetRole, createdAt: item.createdAt, missingKeywords: item.findings?.missingKeywords || [] })) },
    coding: { attempted: codingAttempted.length, solved: codingSolved.length, inProgress: uniqueCoding.filter((item) => ["IN_PROGRESS", "ATTEMPTED", "REVISION_REQUIRED"].includes(item.status)).length, byDifficulty: codingSolved.reduce((result, item) => { result[item.problem.difficulty] = (result[item.problem.difficulty] || 0) + 1; return result; }, {}), acceptanceRate: null, submissions: codingAttempted.length },
    interviews: { completed: interviews.length, averageScore: average(interviewScores), recent: interviewScores.slice(0, 5) },
    assessments: { attempted: assessments.length, averageScore: average(assessmentScores), accuracy: assessmentQuestions ? Math.round((assessmentCorrect / assessmentQuestions) * 100) : null, correct: assessmentCorrect, questions: assessmentQuestions },
    skills: skills.map((item) => ({ name: item.skill.name, category: item.skill.category, proficiency: item.proficiency == null ? null : Number(item.proficiency), evidenceType: item.evidenceType })),
    activityRangeDays,
    activities: activities.map((item) => ({ id: item.id, type: item.activityType, occurredAt: item.occurredAt, topic: item.topic?.name || null, metadata: item.metadata })),
  };
}

router.get("/performance", async (req, res, next) => {
  try {
    const { range } = z.object({ range: z.enum(["7", "30", "90"]).default("30") }).parse(req.query);
    res.json({ data: await performance(req.auth.sub, Number(range)) });
  } catch (error) { next(error); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const userId = req.auth.sub;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        headline: true,
        bio: true,
        location: true,
        githubUrl: true,
        linkedinUrl: true,
        portfolioUrl: true,
        _count: { select: { educations: true, skills: true, projects: true, experiences: true, certifications: true } },
      },
    });
    if (!profile) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "PROFILE_NOT_FOUND" });

    const [
      summary,
      resumeCount,
      applications,
      applicationCounts,
      upcomingInterviews,
      assignedAssessments,
      plans,
      unreadNotifications,
      activities,
    ] = await Promise.all([
      performance(userId),
      prisma.resume.count({ where: { studentId: profile.id, deletedAt: null } }),
      prisma.application.findMany({
        where: { studentUserId: userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, status: true, updatedAt: true, job: { select: { title: true } } },
      }),
      prisma.application.groupBy({
        by: ["status"],
        where: { studentUserId: userId },
        _count: { _all: true },
      }),
      prisma.recruiterInterview.findMany({
        where: {
          participants: { some: { userId } },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          scheduledStart: { gte: now },
        },
        orderBy: { scheduledStart: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          scheduledStart: true,
          timezone: true,
          company: { select: { name: true } },
          application: { select: { job: { select: { title: true } } } },
        },
      }),
      prisma.assessmentAssignment.findMany({
        where: { studentUserId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
        orderBy: [{ dueAt: "asc" }, { invitedAt: "desc" }],
        take: 10,
        select: { id: true, status: true, dueAt: true, assessment: { select: { title: true } } },
      }),
      prisma.studyPlan.findMany({
        where: { studentProfileId: profile.id, status: "ACTIVE" },
        select: { id: true, targetRole: true, tasks: { select: { status: true } } },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.studentActivity.findMany({
        where: { studentProfileId: profile.id, occurredAt: { gte: weekStart } },
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: { id: true, activityType: true, occurredAt: true, topic: { select: { name: true } } },
      }),
    ]);

    const profileSignals = [
      Boolean(profile.phone),
      Boolean(profile.headline),
      Boolean(profile.bio),
      Boolean(profile.location),
      profile._count.educations > 0,
      profile._count.skills >= 3,
      profile._count.projects > 0,
      profile._count.experiences > 0 || profile._count.certifications > 0,
      Boolean(profile.githubUrl || profile.linkedinUrl || profile.portfolioUrl),
      resumeCount > 0,
    ];
    const applicationStatusCounts = Object.fromEntries(applicationCounts.map(({ status, _count }) => [status, _count._all]));
    const studyTasks = plans.flatMap((plan) => plan.tasks);
    const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        count: activities.filter((activity) => activity.occurredAt.toISOString().slice(0, 10) === key).length,
      };
    });
    const recommendations = [];
    if (profileSignals.filter(Boolean).length < profileSignals.length) {
      recommendations.push({ label: "Complete your profile", href: "/student/profile", reason: "A more complete profile helps recruiters understand your experience." });
    }
    if (!resumeCount) {
      recommendations.push({ label: "Add a resume", href: "/student/profile", reason: "Upload a resume to unlock resume analysis and job applications." });
    } else if (summary.resume.latestScore == null) {
      recommendations.push({ label: "Analyze your resume", href: "/student/resume-analysis", reason: "Get an evidence-based estimate and improvement suggestions." });
    }
    if (!plans.length || studyTasks.every((task) => task.status === "COMPLETED")) {
      recommendations.push({ label: "Plan your next study session", href: "/student/planner", reason: "Turn your preparation goals into trackable tasks." });
    }
    if (!summary.interviews.completed) {
      recommendations.push({ label: "Try an AI interview", href: "/student/interviews", reason: "Practice answering role-specific interview questions." });
    }

    res.json({
      data: {
        profile: { name: [profile.firstName, profile.lastName].filter(Boolean).join(" "), completionPercent: Math.round(profileSignals.filter(Boolean).length * 10) },
        resume: { count: resumeCount, latestScore: summary.resume.latestScore },
        interviews: { completed: summary.interviews.completed, averageScore: summary.interviews.averageScore },
        applications: { recent: applications, statusCounts: applicationStatusCounts },
        upcomingInterviews,
        assessments: { upcoming: assignedAssessments },
        studyPlan: {
          activePlans: plans.length,
          completedTasks: studyTasks.filter((task) => task.status === "COMPLETED").length,
          totalTasks: studyTasks.length,
        },
        notifications: { unread: unreadNotifications },
        weeklyActivity,
        recentActivity: activities.slice(0, 5).map((activity) => ({
          id: activity.id,
          type: activity.activityType,
          topic: activity.topic?.name || null,
          occurredAt: activity.occurredAt,
        })),
        recommendations,
      },
    });
  } catch (error) { next(error); }
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
    const profileId = await profileFor(req.auth.sub);
    const resources = await getPrisma().learningResource.findMany({
      where: {
        status: "PUBLISHED",
        ...(req.query.topicId ? { topicId: String(req.query.topicId) } : {}),
        ...(req.query.subjectId ? { subjectId: String(req.query.subjectId) } : {}),
        ...(req.query.search ? { title: { contains: String(req.query.search), mode: "insensitive" } } : {}),
      },
      orderBy: { title: "asc" },
      take: 100,
      include: {
        topic: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        progress: { where: { studentProfileId: profileId }, select: { status: true, percent: true, lastActivityAt: true } },
      },
    });
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

router.post("/plans/:planId/tasks", async (req, res, next) => {
  try {
    const input = taskInputSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const plan = await getPrisma().studyPlan.findFirst({ where: { id: req.params.planId, studentProfileId: profileId }, select: { id: true } });
    if (!plan) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study plan not found." } });
    if (input.goalId) {
      const goal = await getPrisma().studyGoal.findFirst({ where: { id: input.goalId, studyPlanId: plan.id }, select: { id: true } });
      if (!goal) return res.status(400).json({ error: { code: "INVALID_GOAL", message: "The selected goal does not belong to this study plan." } });
    }
    if (input.topicId) {
      const topic = await getPrisma().topic.findUnique({ where: { id: input.topicId }, select: { id: true } });
      if (!topic) return res.status(400).json({ error: { code: "INVALID_TOPIC", message: "The selected topic was not found." } });
    }
    const task = await getPrisma().studyTask.create({
      data: { studyPlanId: plan.id, title: input.title, dueAt: input.dueAt, priority: input.priority, goalId: input.goalId, topicId: input.topicId, status: "OPEN", source: "STUDENT" },
    });
    res.status(201).json({ data: task });
  } catch (error) { next(error); }
});

router.patch("/plans/:planId/tasks/:taskId", async (req, res, next) => {
  try {
    const input = taskUpdateSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const task = await getPrisma().studyTask.findFirst({ where: { id: req.params.taskId, studyPlanId: req.params.planId, plan: { studentProfileId: profileId } }, select: { id: true } });
    if (!task) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study task not found." } });
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.studyTask.update({ where: { id: task.id }, data: input });
      if (input.status === "COMPLETED") {
        await tx.studyTaskCompletion.upsert({
          where: { taskId_completedByUserId: { taskId: task.id, completedByUserId: req.auth.sub } },
          update: { completedAt: new Date() },
          create: { taskId: task.id, completedByUserId: req.auth.sub },
        });
      } else if (input.status) {
        await tx.studyTaskCompletion.deleteMany({ where: { taskId: task.id, completedByUserId: req.auth.sub } });
      }
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.delete("/plans/:planId/tasks/:taskId", async (req, res, next) => {
  try {
    const profileId = await profileFor(req.auth.sub);
    const deleted = await getPrisma().studyTask.deleteMany({
      where: { id: req.params.taskId, studyPlanId: req.params.planId, plan: { studentProfileId: profileId } },
    });
    if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study task not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

async function mentorReply(message, context, history = []) {
  const provider = providerConfig();
  const noProvider = provider.provider === "none"
    || (provider.provider === "gemini" && !provider.geminiKey)
    || (provider.provider === "openai-compatible" && (!provider.openAiUrl || !provider.openAiKey));
  if (noProvider) return { text: `Local mentor suggestion: focus on the evidence-backed gaps in your dashboard. Start with ${context.weakestTopic || "one weak topic"} and practice a small, measurable task today.`, provider: "mock", modelAlias: "local-mentor-v1" };
  try {
    const recentHistory = history.slice(-10).map((item) => ({
      role: item.role === "ASSISTANT" ? "assistant" : "user",
      content: redactSensitiveMentorInput(item.content),
    }));
    const result = await generateJson(z.object({ text: z.string().min(1).max(5000) }), {
      system: CAREER_MENTOR_SYSTEM_PROMPT,
      maxTokens: 700,
      messages: [
        ...recentHistory,
        { role: "user", content: redactSensitiveMentorInput(message) },
      ],
    });
    return { text: result.output.text, provider: result.provider, modelAlias: result.modelAlias };
  } catch (error) {
    if (["LLM_UNAVAILABLE", "LLM_NOT_CONFIGURED"].includes(error.code)) {
      return {
        text: "I’m sorry, but the AI mentor is temporarily unavailable. Your message is saved; please retry in a moment.",
        provider: "fallback",
        modelAlias: "friendly-mentor-fallback-v1",
      };
    }
    throw error;
  }
}

router.post("/mentor/conversations", mentorRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(req.body);
    const context = await performance(req.auth.sub);
    const prisma = getPrisma();
    const conversation = await prisma.aIConversation.create({
      data: { userId: req.auth.sub, subject: input.message.slice(0, 80), topic: "Career mentor" },
    });
    const userMessage = await prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: input.message },
    });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: userMessage.createdAt } });
    const reply = await mentorReply(input.message, { weakestTopic: context.assessments.accuracy != null && context.assessments.accuracy < 60 ? "assessment accuracy" : "consistent practice", performance: { coding: context.coding, interviews: context.interviews, assessments: context.assessments } });
    const assistant = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.text, modelAlias: reply.modelAlias } });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: assistant.createdAt } });
    res.status(201).json({ data: { id: conversation.id, provider: reply.provider, messages: [userMessage, assistant] } });
  } catch (error) { next(error); }
});

router.get("/mentor/conversations", async (req, res, next) => {
  try {
    const conversations = await getPrisma().aIConversation.findMany({
      where: { userId: req.auth.sub },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
    });
    res.json({ data: conversations });
  } catch (error) { next(error); }
});

router.post("/mentor/conversations/:id/messages", mentorRateLimit, async (req, res, next) => {
  try {
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(req.body);
    const prisma = getPrisma();
    const conversation = await prisma.aIConversation.findFirst({ where: { id: req.params.id, userId: req.auth.sub } });
    if (!conversation) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
    const [context, history, userMessage] = await Promise.all([
      performance(req.auth.sub),
      prisma.aIMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 10 }),
      prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } }),
    ]);
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: userMessage.createdAt } });
    const reply = await mentorReply(input.message, {
      weakestTopic: context.assessments.accuracy != null && context.assessments.accuracy < 60 ? "assessment accuracy" : "consistent practice",
      performance: { coding: context.coding, interviews: context.interviews, assessments: context.assessments },
    }, history);
    const assistant = await prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.text, modelAlias: reply.modelAlias },
    });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: assistant.createdAt } });
    res.status(201).json({ data: { id: conversation.id, provider: reply.provider, messages: [userMessage, assistant] } });
  } catch (error) { next(error); }
});

router.post("/mentor/conversations/:id/retry-last", mentorRateLimit, async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const conversation = await prisma.aIConversation.findFirst({ where: { id: req.params.id, userId: req.auth.sub } });
    if (!conversation) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
    const messages = await prisma.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 11,
    });
    const lastUser = messages.find((item) => item.role === "USER");
    if (!lastUser) return res.status(400).json({ error: { code: "NO_MESSAGE_TO_RETRY", message: "There is no answer to retry." } });
    await prisma.aIMessage.deleteMany({
      where: { conversationId: conversation.id, role: "ASSISTANT", createdAt: { gte: lastUser.createdAt } },
    });
    const history = messages.filter((item) => item.id !== lastUser.id).reverse().slice(-10);
    const context = await performance(req.auth.sub);
    const reply = await mentorReply(lastUser.content, {
      weakestTopic: context.assessments.accuracy != null && context.assessments.accuracy < 60 ? "assessment accuracy" : "consistent practice",
      performance: { coding: context.coding, interviews: context.interviews, assessments: context.assessments },
    }, history);
    const assistant = await prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.text, modelAlias: reply.modelAlias },
    });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: assistant.createdAt } });
    res.status(201).json({ data: { id: conversation.id, provider: reply.provider, message: assistant } });
  } catch (error) { next(error); }
});

router.patch("/mentor/conversations/:id", async (req, res, next) => {
  try {
    const input = z.object({ subject: z.string().trim().min(1).max(80) }).parse(req.body);
    const updated = await getPrisma().aIConversation.updateMany({
      where: { id: req.params.id, userId: req.auth.sub },
      data: { subject: input.subject },
    });
    if (!updated.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

router.delete("/mentor/conversations/:id", async (req, res, next) => {
  try {
    const deleted = await getPrisma().aIConversation.deleteMany({ where: { id: req.params.id, userId: req.auth.sub } });
    if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.mentorReply = mentorReply;
module.exports.mentorMessageSchema = mentorMessageSchema;
module.exports.redactSensitiveMentorInput = redactSensitiveMentorInput;
module.exports.CAREER_MENTOR_SYSTEM_PROMPT = CAREER_MENTOR_SYSTEM_PROMPT;
