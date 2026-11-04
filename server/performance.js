"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();
const planSchema = z.object({
  targetRole: z.string().trim().min(2).max(200),
  deadline: z.coerce.date().nullable().optional().refine((value) => !value || value > new Date(), "Deadline must be in the future."),
  dailyMinutes: z.number().int().min(15).max(720),
  goals: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
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

router.get("/dashboard", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const userId = req.auth.sub;
    const profileId = await profileFor(userId);

    // Parallel aggregation — all queries scoped to the authenticated student
    const [
      profile,
      codingStats,
      recentSubmissions,
      assessmentAttempts,
      interviewSessions,
      studyPlans,
      recentActivities,
      notifications,
      upcomingInterviews,
      upcomingAssessments,
      learningProgress,
      contests,
    ] = await Promise.all([
      prisma.studentProfile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true, headline: true, readinessScore: true, updatedAt: true, skills: { select: { id: true } }, educations: { select: { id: true } }, projects: { select: { id: true } }, experiences: { select: { id: true } }, certifications: { select: { id: true } }, resumes: { where: { deletedAt: null }, select: { id: true } } },
      }),
      prisma.studentProblemProgress.findMany({ where: { userId }, select: { status: true, solvedAt: true, lastSubmittedAt: true } }),
      prisma.codeSubmission.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, verdict: true, createdAt: true, problem: { select: { title: true, slug: true, difficulty: true } } } }),
      prisma.assessmentAttempt.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 10, select: { id: true, status: true, score: true, startedAt: true, submittedAt: true, assignment: { select: { assessmentId: true, dueAt: true, assessment: { select: { title: true, type: true } } } }, result: { select: { correctCount: true, incorrectCount: true, unattemptedCount: true } } } }),
      prisma.interviewSession.findMany({ where: { createdByUserId: userId }, orderBy: { startedAt: "desc" }, take: 5, select: { id: true, type: true, status: true, configuration: true, startedAt: true, completedAt: true, evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true } } } }),
      prisma.studyPlan.findMany({ where: { studentProfileId: profileId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, targetRole: true, dailyMinutes: true, deadline: true, tasks: { where: { status: { not: "COMPLETED" } }, orderBy: { dueAt: "asc" }, take: 5, select: { id: true, title: true, dueAt: true, priority: true, status: true } } } }),
      prisma.studentActivity.findMany({ where: { studentProfileId: profileId }, orderBy: { occurredAt: "desc" }, take: 10, select: { id: true, activityType: true, occurredAt: true, durationSeconds: true, metadata: true, topic: { select: { name: true, subject: { select: { name: true } } } } } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.recruiterInterview.findMany({ where: { participants: { some: { userId } }, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledStart: { gte: new Date() } }, orderBy: { scheduledStart: "asc" }, take: 5, select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, timezone: true, status: true } }),
      prisma.assessmentAssignment.findMany({ where: { studentUserId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, dueAt: { gte: new Date() } }, orderBy: { dueAt: "asc" }, take: 5, select: { id: true, dueAt: true, assessment: { select: { id: true, title: true, type: true, durationSeconds: true } } } }),
      prisma.learningProgress.findMany({ where: { studentProfileId: profileId }, include: { topic: { select: { name: true, subject: { select: { id: true, name: true, slug: true } } } } }, orderBy: { lastActivityAt: "desc" }, take: 50 }),
      prisma.contestRegistration.findMany({ where: { userId, contest: { status: { in: ["PUBLISHED", "LIVE"] } } }, select: { contestId: true, contest: { select: { id: true, title: true, startsAt: true, endsAt: true, status: true } } } }),
    ]);

    // Compute profile completion
    const completionChecks = [profile?.firstName, profile?.lastName, profile?.headline, profile?.skills?.length, profile?.educations?.length, profile?.projects?.length, profile?.experiences?.length, profile?.certifications?.length, profile?.resumes?.length];
    const profileCompletion = Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100);

    // Coding stats
    const solved = codingStats.filter((p) => p.status === "SOLVED").length;
    const attempted = codingStats.length;
    const allSubmissions = await prisma.codeSubmission.count({ where: { userId } });
    const acceptedSubmissions = await prisma.codeSubmission.count({ where: { userId, verdict: "ACCEPTED" } });

    // Streak: consecutive days with at least one accepted submission
    const streakSubmissions = await prisma.codeSubmission.findMany({ where: { userId, verdict: "ACCEPTED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    let streak = 0;
    if (streakSubmissions.length > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = new Set(streakSubmissions.map((s) => { const d = new Date(s.createdAt); d.setHours(0, 0, 0, 0); return d.getTime(); }));
      let check = today.getTime();
      while (days.has(check)) { streak++; check -= 86400000; }
    }

    // Assessment stats
    const completedAttempts = assessmentAttempts.filter((a) => ["GRADED", "SUBMITTED"].includes(a.status));
    const scores = completedAttempts.map((a) => Number(a.score || 0)).filter((s) => s > 0);
    const avgAssessmentScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    // Interview stats
    const completedInterviews = interviewSessions.filter((s) => s.status === "COMPLETED");
    const interviewScores = completedInterviews.flatMap((s) => s.evaluations.map((e) => Number(e.overallScore || 0)));
    const avgInterviewScore = interviewScores.length ? Math.round(interviewScores.reduce((a, b) => a + b, 0) / interviewScores.length) : null;

    // Subject-wise progress from learning progress records
    const subjectMap = {};
    for (const lp of learningProgress) {
      if (!lp.topic?.subject) continue;
      const { id: subjectId, name: subjectName, slug: subjectSlug } = lp.topic.subject;
      if (!subjectMap[subjectId]) subjectMap[subjectId] = { id: subjectId, name: subjectName, slug: subjectSlug, completed: 0, inProgress: 0, lastActivityAt: null };
      if (lp.status === "COMPLETED") subjectMap[subjectId].completed++;
      else subjectMap[subjectId].inProgress++;
      if (!subjectMap[subjectId].lastActivityAt || lp.lastActivityAt > subjectMap[subjectId].lastActivityAt) subjectMap[subjectId].lastActivityAt = lp.lastActivityAt;
    }

    // In-progress assessment (resume workflow)
    const inProgressAttempt = assessmentAttempts.find((a) => a.status === "IN_PROGRESS");

    // Recent activity timeline — merge multiple sources
    const timeline = [
      ...recentSubmissions.map((s) => ({ id: s.id, type: "CODING_SUBMISSION", label: `${s.problem.title} — ${s.verdict}`, link: `/student/coding/${s.problem.slug}`, occurredAt: s.createdAt, meta: { difficulty: s.problem.difficulty, verdict: s.verdict } })),
      ...completedAttempts.slice(0, 3).map((a) => ({ id: a.id, type: "ASSESSMENT_ATTEMPT", label: `${a.assignment.assessment.title} — ${a.score ?? "unscored"}`, link: `/student/assessments/results/${a.id}`, occurredAt: a.submittedAt || a.startedAt, meta: { score: a.score } })),
      ...completedInterviews.slice(0, 3).map((s) => ({ id: s.id, type: "AI_INTERVIEW", label: `${s.type.replace("AI_", "")} interview`, link: `/student/interviews/${s.id}`, occurredAt: s.completedAt || s.startedAt, meta: { score: s.evaluations[0]?.overallScore } })),
      ...recentActivities.map((a) => ({ id: a.id, type: a.activityType, label: a.topic ? `${a.activityType} · ${a.topic.name}` : a.activityType, occurredAt: a.occurredAt, meta: a.metadata })),
    ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 12);

    res.json({
      data: {
        student: { name: `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(), headline: profile?.headline || null, profileCompletion, lastActive: recentActivities[0]?.occurredAt || null },
        overview: { codingSolved: solved, codingAttempted: attempted, codingStreak: streak, totalSubmissions: allSubmissions, acceptedSubmissions, assessmentsCompleted: completedAttempts.length, avgAssessmentScore, interviewsCompleted: completedInterviews.length, avgInterviewScore },
        subjects: Object.values(subjectMap),
        studyPlan: studyPlans[0] || null,
        timeline,
        upcoming: { interviews: upcomingInterviews, assessments: upcomingAssessments.map((a) => ({ ...a, assessment: a.assessment })), contests: contests.filter((c) => new Date(c.contest.endsAt) > new Date()).map((c) => c.contest) },
        inProgress: { assessment: inProgressAttempt ? { id: inProgressAttempt.id, title: inProgressAttempt.assignment.assessment.title, expiresAt: inProgressAttempt.assignment.dueAt } : null },
        unreadNotifications: notifications,
      },
    });
  } catch (error) { next(error); }
});

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
    const profileId = await profileFor(req.auth.sub);
    const resources = await getPrisma().learningResource.findMany({
      where: {
        status: "PUBLISHED",
        ...(req.query.topicId ? { topicId: String(req.query.topicId) } : {}),
        ...(req.query.subjectId ? { subjectId: String(req.query.subjectId) } : {}),
        ...(req.query.search ? { title: { contains: String(req.query.search), mode: "insensitive" } } : {}),
        ...(req.query.kind ? { kind: String(req.query.kind) } : {}),
      },
      orderBy: { title: "asc" },
      take: 100,
      include: {
        topic: { select: { name: true } },
        subject: { select: { name: true } },
        progress: { where: { studentProfileId: profileId }, select: { status: true, percent: true } },
      },
    });
    res.json({
      data: resources.map(({ progress, ...resource }) => ({
        ...resource,
        progress: progress[0] || { status: "NOT_STARTED", percent: 0 },
      })),
    });
  } catch (error) { next(error); }
});

router.post("/resources/:id/progress", async (req, res, next) => {
  try {
    const input = z.object({ percent: z.number().min(0).max(100) }).parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const prisma = getPrisma();
    const resource = await prisma.learningResource.findFirst({ where: { id: req.params.id, status: "PUBLISHED" } });
    if (!resource) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
    const progress = await prisma.$transaction(async (tx) => {
      const current = await tx.learningProgress.findFirst({
        where: { studentProfileId: profileId, resourceId: resource.id, topicId: resource.topicId },
        select: { id: true },
      });
      const progressData = {
        percent: input.percent,
        status: input.percent >= 100 ? "COMPLETED" : "IN_PROGRESS",
        lastActivityAt: new Date(),
      };
      return current
        ? tx.learningProgress.update({ where: { id: current.id }, data: progressData })
        : tx.learningProgress.create({
          data: { studentProfileId: profileId, resourceId: resource.id, topicId: resource.topicId, ...progressData },
        });
    });
    res.json({ data: progress });
  } catch (error) { next(error); }
});

router.post("/plans", async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const plan = await getPrisma().$transaction(async (tx) => {
      const created = await tx.studyPlan.create({
        data: {
          studentProfileId: profileId,
          targetRole: input.targetRole,
          deadline: input.deadline || null,
          dailyMinutes: input.dailyMinutes,
          goals: { create: input.goals.map((title, index) => ({ title, priority: index === 0 ? "HIGH" : "MEDIUM", status: "OPEN" })) },
        },
      });
      const goals = await tx.studyGoal.findMany({ where: { studyPlanId: created.id }, orderBy: { id: "asc" } });
      await tx.studyTask.createMany({
        data: goals.map((goal, index) => ({
          studyPlanId: created.id,
          goalId: goal.id,
          title: `Practice: ${goal.title}`,
          dueAt: input.deadline
            ? new Date(Math.min(Date.now() + (index + 1) * 86400000, input.deadline.getTime()))
            : new Date(Date.now() + (index + 1) * 86400000),
          priority: goal.priority,
          status: "OPEN",
          source: "STUDENT_GOAL",
        })),
      });
      return tx.studyPlan.findUnique({ where: { id: created.id }, include: { goals: true, tasks: { orderBy: { dueAt: "asc" } } } });
    });
    res.status(201).json({ data: plan });
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
    const completion = await getPrisma().$transaction(async (tx) => {
      const result = await tx.studyTaskCompletion.upsert({
        where: { taskId_completedByUserId: { taskId: task.id, completedByUserId: req.auth.sub } },
        update: { completedAt: new Date() },
        create: { taskId: task.id, completedByUserId: req.auth.sub },
      });
      await tx.studyTask.update({ where: { id: task.id }, data: { status: "COMPLETED" } });
      if (task.goalId) {
        const remainingGoalTasks = await tx.studyTask.count({ where: { goalId: task.goalId, status: { not: "COMPLETED" } } });
        if (remainingGoalTasks === 0) await tx.studyGoal.update({ where: { id: task.goalId }, data: { status: "COMPLETED" } });
      }
      const remainingPlanTasks = await tx.studyTask.count({ where: { studyPlanId: req.params.planId, status: { not: "COMPLETED" } } });
      if (remainingPlanTasks === 0) await tx.studyPlan.update({ where: { id: req.params.planId }, data: { status: "COMPLETED" } });
      return result;
    });
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
    const input = z.object({ message: z.string().trim().min(1).max(5000), conversationId: z.string().uuid().optional() }).parse(req.body);
    const context = await performance(req.auth.sub);
    const prisma = getPrisma();
    let conversation;
    if (input.conversationId) {
      // Append to existing conversation — verify ownership
      conversation = await prisma.aiConversation.findFirst({ where: { id: input.conversationId, userId: req.auth.sub }, include: { messages: { orderBy: { createdAt: "asc" } } } });
      if (!conversation) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
      await prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
    } else {
      // New conversation
      conversation = await prisma.aiConversation.create({ data: { userId: req.auth.sub, subject: "Student mentor", topic: "Performance", messages: { create: { role: "USER", content: input.message } } }, include: { messages: true } });
    }
    const mentorContext = {
      weakestTopic: context.assessments.accuracy != null && context.assessments.accuracy < 60 ? "assessment accuracy" : "consistent practice",
      performance: { coding: context.coding, interviews: context.interviews, assessments: context.assessments },
      skills: context.skills.slice(0, 10),
    };
    let reply;
    try {
      reply = await mentorReply(input.message, mentorContext);
    } catch (error) {
      console.warn("AI mentor response failed; returning local guidance.", { name: error.name, code: error.code });
      reply = {
        text: `The AI mentor service is temporarily unavailable. For now, start with ${mentorContext.weakestTopic}, review one example related to “${input.message.slice(0, 240)}”, then solve one small practice question and note what to improve.`,
        provider: "local-fallback",
        modelAlias: "local-mentor-fallback-v1",
      };
    }
    const assistant = await prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.text, modelAlias: reply.modelAlias } });
    // Refresh messages for response
    const allMessages = await prisma.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
    res.status(201).json({ data: { id: conversation.id, provider: reply.provider, messages: allMessages } });
  } catch (error) { next(error); }
});

router.get("/mentor/conversations", async (req, res, next) => {
  try { res.json({ data: await getPrisma().aiConversation.findMany({ where: { userId: req.auth.sub }, orderBy: { lastMessageAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } } }) }); } catch (error) { next(error); }
});

module.exports = router;
