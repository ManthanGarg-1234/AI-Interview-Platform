"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();
const MS_DAY = 86400000;

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
const performanceQuerySchema = z.object({ range: z.enum(["7", "30", "90"]).default("30") });
// Minutes ahead of UTC for the client's timezone (IST = 330). Defaults to UTC.
const dashboardQuerySchema = z.object({ tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0) });
const activitiesQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

// YYYY-MM-DD of a moment as seen in a timezone offset (minutes ahead of UTC).
function dayKey(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

// The UTC instant at which the local day containing `now` began.
function localDayStart(now, offsetMinutes) {
  const local = new Date(now.getTime() + offsetMinutes * 60000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMinutes * 60000);
}

async function profileFor(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "PROFILE_NOT_FOUND" });
  return profile.id;
}

// Keeps goal and plan status consistent with their tasks, in both directions.
async function syncCompletionState(tx, planId, goalId) {
  if (goalId) {
    const total = await tx.studyTask.count({ where: { goalId } });
    const remaining = await tx.studyTask.count({ where: { goalId, status: { not: "COMPLETED" } } });
    if (total > 0 && remaining === 0) {
      await tx.studyGoal.updateMany({ where: { id: goalId, status: { not: "COMPLETED" } }, data: { status: "COMPLETED" } });
    } else {
      await tx.studyGoal.updateMany({ where: { id: goalId, status: "COMPLETED" }, data: { status: "OPEN" } });
    }
  }
  const total = await tx.studyTask.count({ where: { studyPlanId: planId } });
  const remaining = await tx.studyTask.count({ where: { studyPlanId: planId, status: { not: "COMPLETED" } } });
  if (total > 0 && remaining === 0) {
    await tx.studyPlan.updateMany({ where: { id: planId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
  } else {
    await tx.studyPlan.updateMany({ where: { id: planId, status: "COMPLETED" }, data: { status: "ACTIVE" } });
  }
}

async function performance(userId, activityRangeDays = 30, knownProfileId = null) {
  const prisma = getPrisma();
  const profileId = knownProfileId || await profileFor(userId);
  const activitySince = new Date(Date.now() - activityRangeDays * MS_DAY);
  const [resume, coding, interviews, activities, skills] = await Promise.all([
    prisma.resumeAnalysis.findMany({ where: { resumeVersion: { resume: { student: { userId } } } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, score: true, status: true, targetRole: true, createdAt: true, findings: true } }),
    prisma.sheetProblemProgress.findMany({ where: { userId }, include: { problem: { select: { id: true, canonicalProblemId: true, difficulty: true, title: true } } } }),
    prisma.interviewSession.findMany({ where: { createdByUserId: userId, status: "COMPLETED" }, include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true, categoryScores: true } } } }),
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
  return {
    resume: { latestScore: resume[0]?.score == null ? null : Number(resume[0].score), history: resume.map((item) => ({ id: item.id, score: item.score == null ? null : Number(item.score), status: item.status, targetRole: item.targetRole, createdAt: item.createdAt, missingKeywords: item.findings?.missingKeywords || [] })) },
    coding: { attempted: codingAttempted.length, solved: codingSolved.length, inProgress: uniqueCoding.filter((item) => ["IN_PROGRESS", "ATTEMPTED", "REVISION_REQUIRED"].includes(item.status)).length, byDifficulty: codingSolved.reduce((result, item) => { result[item.problem.difficulty] = (result[item.problem.difficulty] || 0) + 1; return result; }, {}), acceptanceRate: null, submissions: codingAttempted.length },
    interviews: { completed: interviews.length, averageScore: average(interviewScores), recent: interviewScores.slice(0, 5) },
    skills: skills.map((item) => ({ name: item.skill.name, category: item.skill.category, proficiency: item.proficiency == null ? null : Number(item.proficiency), evidenceType: item.evidenceType })),
    activityRangeDays,
    activities: activities.map((item) => ({ id: item.id, type: item.activityType, occurredAt: item.occurredAt, topic: item.topic?.name || null, metadata: item.metadata })),
  };
}

router.get("/performance", async (req, res, next) => {
  try {
    const { range } = performanceQuerySchema.parse(req.query);
    res.json({ data: await performance(req.auth.sub, Number(range)) });
  } catch (error) { next(error); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const userId = req.auth.sub;
    const { tzOffsetMinutes } = dashboardQuerySchema.parse(req.query);
    const now = new Date();
    const todayStart = localDayStart(now, tzOffsetMinutes);
    const weekStart = new Date(todayStart.getTime() - 6 * MS_DAY);
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
        readinessScore: true,
        readinessFormulaVersion: true,
        readinessCalculatedAt: true,
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
      plans,
      unreadNotifications,
      activities,
      subjectProgress,
      latestResume,
      todayCompletions,
    ] = await Promise.all([
      performance(userId, 30, profile.id),
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
      prisma.studyPlan.findMany({
        where: { studentProfileId: profile.id, status: "ACTIVE" },
        select: { id: true, targetRole: true, dailyMinutes: true, tasks: { select: { id: true, title: true, status: true, dueAt: true } } },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.studentActivity.findMany({
        where: { studentProfileId: profile.id, occurredAt: { gte: new Date(now.getTime() - 365 * MS_DAY) } },
        orderBy: { occurredAt: "desc" },
        take: 1000,
        select: { id: true, activityType: true, occurredAt: true, durationSeconds: true, metadata: true, topic: { select: { name: true } } },
      }),
      prisma.learningProgress.findMany({
        where: { studentProfileId: profile.id },
        include: {
          topic: {
            select: {
              id: true,
              name: true,
              subject: { select: { id: true, name: true, _count: { select: { topics: true } } } },
            },
          },
        },
        orderBy: { lastActivityAt: "desc" },
      }),
      prisma.resume.findFirst({ where: { studentId: profile.id, deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, activeVersion: { select: { id: true, version: true, file: { select: { scanStatus: true, originalName: true } } } } } }),
      prisma.studyTaskCompletion.count({ where: { completedByUserId: userId, completedAt: { gte: todayStart }, task: { plan: { studentProfileId: profile.id } } } }),
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
    const profileSignalCount = profileSignals.filter(Boolean).length;
    const applicationStatusCounts = Object.fromEntries(applicationCounts.map(({ status, _count }) => [status, _count._all]));
    const studyTasks = plans.flatMap((plan) => plan.tasks);
    const subjectsById = new Map();
    const seenTopics = new Set();
    for (const progress of subjectProgress) {
      const subject = progress.topic?.subject;
      const topic = progress.topic;
      if (!subject || !topic) continue;
      const topicKey = `${subject.id}:${topic.id}`;
      if (seenTopics.has(topicKey)) continue;
      seenTopics.add(topicKey);
      const card = subjectsById.get(subject.id) || {
        id: subject.id,
        name: subject.name,
        totalTopics: subject._count.topics,
        completed: 0,
        inProgress: 0,
        lastActivityAt: progress.lastActivityAt,
      };
      if (progress.status === "COMPLETED") card.completed += 1;
      else if (["IN_PROGRESS", "ATTEMPTED", "REVISION_REQUIRED"].includes(progress.status)) card.inProgress += 1;
      if (progress.lastActivityAt > card.lastActivityAt) card.lastActivityAt = progress.lastActivityAt;
      subjectsById.set(subject.id, card);
    }
    const labels = {
      CODING_SUBMISSION: "Coding submission",
      AI_INTERVIEW: "AI interview",
      TOPIC_VIEWED: "Viewed topic",
    };
    const links = {
      CODING_SUBMISSION: "/student/coding",
      AI_INTERVIEW: "/student/interviews",
      TOPIC_VIEWED: "/student/subjects",
    };
    const timeline = activities.slice(0, 5).map((activity) => {
      const type = activity.activityType;
      const baseLabel = labels[type] || type.replaceAll("_", " ").toLowerCase();
      return {
        id: activity.id,
        type,
        occurredAt: activity.occurredAt,
        label: activity.topic?.name ? `${baseLabel}: ${activity.topic.name}` : baseLabel,
        link: links[type],
        meta: activity.metadata || {},
      };
    });

    // One pass over activities, bucketed by the client's local day.
    const activityCountByDay = new Map();
    for (const activity of activities) {
      const key = dayKey(activity.occurredAt, tzOffsetMinutes);
      activityCountByDay.set(key, (activityCountByDay.get(key) || 0) + 1);
    }
    const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
      const key = dayKey(new Date(weekStart.getTime() + index * MS_DAY), tzOffsetMinutes);
      return { date: key, count: activityCountByDay.get(key) || 0 };
    });

    const recommendations = [];
    if (profileSignalCount < profileSignals.length) {
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

    let streak = 0;
    let cursor = todayStart;
    if (!activityCountByDay.has(dayKey(cursor, tzOffsetMinutes))) cursor = new Date(cursor.getTime() - MS_DAY);
    while (activityCountByDay.has(dayKey(cursor, tzOffsetMinutes))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - MS_DAY);
    }

    const weakTopics = subjectProgress
      .filter((progress) => progress.topic && (progress.status === "REVISION_REQUIRED" || Number(progress.percent) < 40))
      .slice(0, 5)
      .map((progress) => ({ id: progress.topic.id, name: progress.topic.name, subject: progress.topic.subject?.name, status: progress.status, percent: Number(progress.percent) }));
    const todayActivity = activities.filter((activity) => activity.occurredAt >= todayStart);
    const activePlan = plans[0] || null;
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    const profileCompletion = Math.round(profileSignalCount * 10);

    res.json({
      data: {
        profile: { name: fullName, headline: profile.headline, completionPercent: profileCompletion },
        student: { name: fullName, headline: profile.headline, profileCompletion },
        overview: {
          codingSolved: summary.coding.solved,
          interviewsCompleted: summary.interviews.completed,
          avgInterviewScore: summary.interviews.averageScore,
          problemsAttempted: summary.coding.attempted,
          applicationsTotal: Object.values(applicationStatusCounts).reduce((sum, count) => sum + count, 0),
        },
        resume: { count: resumeCount, latestScore: summary.resume.latestScore, latest: latestResume ? { id: latestResume.id, title: latestResume.title, versionId: latestResume.activeVersion?.id || null, version: latestResume.activeVersion?.version || null, scanStatus: latestResume.activeVersion?.file?.scanStatus || "UNAVAILABLE", originalName: latestResume.activeVersion?.file?.originalName || null } : null },
        interviews: { completed: summary.interviews.completed, averageScore: summary.interviews.averageScore },
        applications: { recent: applications, statusCounts: applicationStatusCounts },
        upcomingInterviews,
        studyPlan: {
          activePlans: plans.length,
          completedTasks: studyTasks.filter((task) => task.status === "COMPLETED").length,
          totalTasks: studyTasks.length,
          tasks: studyTasks.filter((task) => task.status !== "COMPLETED"),
        },
        preparation: { weakTopics },
        dailyStudy: { streakDays: streak, completedTasks: todayCompletions, trackedMinutes: Math.floor(todayActivity.reduce((total, activity) => total + (activity.durationSeconds || 0), 0) / 60), goalMinutes: activePlan?.dailyMinutes ?? null },
        readiness: { score: profile.readinessScore == null ? null : Number(profile.readinessScore), calculatedAt: profile.readinessCalculatedAt || null, formulaVersion: profile.readinessFormulaVersion || null, status: profile.readinessScore == null ? "NOT_CALCULATED" : "AVAILABLE" },
        timeline,
        subjects: [...subjectsById.values()],
        upcoming: { interviews: upcomingInterviews },
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
    const { limit } = activitiesQuerySchema.parse(req.query);
    const profileId = await profileFor(req.auth.sub);
    const activities = await getPrisma().studentActivity.findMany({ where: { studentProfileId: profileId }, orderBy: { occurredAt: "desc" }, take: limit, include: { topic: { select: { name: true } } } });
    res.json({ data: activities.map((item) => ({ id: item.id, type: item.activityType, occurredAt: item.occurredAt, topic: item.topic?.name || null, metadata: item.metadata })) });
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
        },
      });
      // Created one by one so goal order (and therefore due dates) matches the input order.
      const goals = [];
      for (const [index, title] of input.goals.entries()) {
        goals.push(await tx.studyGoal.create({
          data: { studyPlanId: created.id, title, priority: index === 0 ? "HIGH" : "MEDIUM", status: "OPEN" },
        }));
      }
      if (goals.length) {
        await tx.studyTask.createMany({
          data: goals.map((goal, index) => ({
            studyPlanId: created.id,
            goalId: goal.id,
            title: `Practice: ${goal.title}`,
            dueAt: new Date(Date.now() + (index + 1) * MS_DAY),
            priority: goal.priority,
            status: "OPEN",
            source: "STUDENT_GOAL",
          })),
        });
      }
      return tx.studyPlan.findUnique({
        where: { id: created.id },
        include: { goals: true, tasks: true },
      });
    });
    res.status(201).json({ data: plan });
  } catch (error) { next(error); }
});

router.get("/plans", async (req, res, next) => {
  try {
    const profileId = await profileFor(req.auth.sub);
    res.json({ data: await getPrisma().studyPlan.findMany({ where: { studentProfileId: profileId }, orderBy: { updatedAt: "desc" }, include: { goals: true, tasks: { include: { completions: true }, orderBy: { dueAt: "asc" } } } }) });
  } catch (error) { next(error); }
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
      await syncCompletionState(tx, req.params.planId, task.goalId);
      return result;
    });
    res.json({ data: completion });
  } catch (error) { next(error); }
});

router.post("/plans/:planId/tasks", async (req, res, next) => {
  try {
    const input = taskInputSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const prisma = getPrisma();
    const plan = await prisma.studyPlan.findFirst({ where: { id: req.params.planId, studentProfileId: profileId }, select: { id: true } });
    if (!plan) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study plan not found." } });
    if (input.goalId) {
      const goal = await prisma.studyGoal.findFirst({ where: { id: input.goalId, studyPlanId: plan.id }, select: { id: true } });
      if (!goal) return res.status(400).json({ error: { code: "INVALID_GOAL", message: "The selected goal does not belong to this study plan." } });
    }
    if (input.topicId) {
      const topic = await prisma.topic.findUnique({ where: { id: input.topicId }, select: { id: true } });
      if (!topic) return res.status(400).json({ error: { code: "INVALID_TOPIC", message: "The selected topic was not found." } });
    }
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.studyTask.create({
        data: { studyPlanId: plan.id, title: input.title, dueAt: input.dueAt, priority: input.priority, goalId: input.goalId, topicId: input.topicId, status: "OPEN", source: "STUDENT" },
      });
      // A new open task reopens a plan/goal that was previously marked completed.
      await syncCompletionState(tx, plan.id, input.goalId);
      return created;
    });
    res.status(201).json({ data: task });
  } catch (error) { next(error); }
});

router.patch("/plans/:planId/tasks/:taskId", async (req, res, next) => {
  try {
    const input = taskUpdateSchema.parse(req.body);
    const profileId = await profileFor(req.auth.sub);
    const task = await getPrisma().studyTask.findFirst({ where: { id: req.params.taskId, studyPlanId: req.params.planId, plan: { studentProfileId: profileId } }, select: { id: true, goalId: true } });
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
      if (input.status) await syncCompletionState(tx, req.params.planId, task.goalId);
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.delete("/plans/:planId/tasks/:taskId", async (req, res, next) => {
  try {
    const profileId = await profileFor(req.auth.sub);
    const task = await getPrisma().studyTask.findFirst({ where: { id: req.params.taskId, studyPlanId: req.params.planId, plan: { studentProfileId: profileId } }, select: { id: true, goalId: true } });
    if (!task) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Study task not found." } });
    await getPrisma().$transaction(async (tx) => {
      await tx.studyTask.deleteMany({ where: { id: task.id } });
      await syncCompletionState(tx, req.params.planId, task.goalId);
    });
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;