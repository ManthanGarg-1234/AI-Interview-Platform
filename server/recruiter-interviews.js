"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { createNotification } = require("./notifications");

const router = express.Router();
const scheduleInput = z.object({
  applicationId: z.string().uuid(),
  title: z.string().trim().min(2).max(240),
  timezone: z.string().trim().min(1).max(80),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  meetingUrl: z.string().url().max(1000).nullable().optional(),
  rounds: z.array(z.object({ name: z.string().trim().min(1).max(160), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() })).min(1).max(20).default([{ name: "Interview" }]),
  interviewerIds: z.array(z.string().uuid()).max(50).default([]),
});
const changeInput = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), timezone: z.string().trim().min(1).max(80), reason: z.string().trim().max(1000).optional() });

function fail(message, status = 400, code = "INVALID_REQUEST") { throw Object.assign(new Error(message), { status, code }); }
function validWindow(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) fail("Interview end must be after its start.");
  if (end - start > 24 * 60 * 60 * 1000) fail("Interview duration cannot exceed 24 hours.");
}
function canSchedule(access) { return Boolean(access?.active && ["OWNER", "HIRING_MANAGER", "REVIEWER"].includes(access.role)); }
function canManage(access) { return Boolean(access?.active && ["OWNER", "HIRING_MANAGER"].includes(access.role)); }
const transitions = {
  DRAFT: ["SCHEDULED", "CANCELLED"], SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [],
};
function assertTransition(from, to) { if (!transitions[from]?.includes(to)) fail(`Cannot transition interview from ${from} to ${to}.`, 409, "INVALID_STATE"); }
function serialize(item) {
  return { ...item, scheduledStart: item.scheduledStart?.toISOString?.() || item.scheduledStart, scheduledEnd: item.scheduledEnd?.toISOString?.() || item.scheduledEnd };
}
async function companyAccess(prisma, userId, applicationId) {
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { job: true, student: true } });
  if (!application) return null;
  const access = await prisma.companyMember.findFirst({ where: { userId, companyId: application.job.companyId, active: true } });
  return access ? { application, access, companyId: application.job.companyId } : null;
}
async function interviewAccess(prisma, id, userId) {
  return prisma.recruiterInterview.findUnique({
    where: { id },
    include: { application: { include: { job: true, student: true } }, participants: true, rounds: true },
  }).then((interview) => {
    if (!interview) return null;
    const participant = interview.participants.find((p) => p.userId === userId);
    return { interview, participant };
  });
}
async function notifyParticipants(interview, title, body) {
  await Promise.all((interview.participants || []).map((p) => createNotification({ userId: p.userId, type: "INTERVIEW", title, body, resourceType: "RECRUITER_INTERVIEW", resourceId: interview.id })));
}

router.post("/", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const input = scheduleInput.parse(req.body); validWindow(input.startsAt, input.endsAt);
    try { Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(input.startsAt); } catch { fail("A valid IANA timezone is required."); }
    const context = await companyAccess(prisma, req.auth.sub, input.applicationId);
    if (!context || !canSchedule(context.access)) return res.status(403).json({ error: { code: "COMPANY_ACCESS_DENIED", message: "You cannot schedule interviews for this company." } });
    const ids = [...new Set(input.interviewerIds.filter((id) => id !== req.auth.sub))];
    if (ids.length) {
      const members = await prisma.companyMember.findMany({ where: { companyId: context.companyId, userId: { in: ids }, active: true, role: { in: ["OWNER", "HIRING_MANAGER", "REVIEWER", "INTERVIEWER"] } }, select: { userId: true } });
      if (members.length !== ids.length) fail("Every interviewer must be an active member of the company.", 403, "PARTICIPANT_NOT_AUTHORIZED");
    }
    const interview = await prisma.$transaction(async (tx) => {
      const created = await tx.recruiterInterview.create({
        data: { companyId: context.companyId, applicationId: input.applicationId, createdByUserId: req.auth.sub, title: input.title, timezone: input.timezone, scheduledStart: input.startsAt, scheduledEnd: input.endsAt, meetingUrl: input.meetingUrl || null, status: "SCHEDULED",
          rounds: { create: input.rounds.map((round, index) => ({ sequence: index + 1, name: round.name, status: "SCHEDULED", startsAt: round.startsAt || input.startsAt, endsAt: round.endsAt || input.endsAt })) },
          participants: { create: [{ userId: context.application.studentUserId, role: "CANDIDATE" }, ...ids.map((userId) => ({ userId, role: "INTERVIEWER" }))] } },
        include: { participants: true, rounds: true },
      });
      await tx.application.update({ where: { id: input.applicationId }, data: { status: "TECHNICAL_INTERVIEW" } });
      await tx.applicationStageHistory.create({ data: { applicationId: input.applicationId, fromStatus: context.application.status, toStatus: "TECHNICAL_INTERVIEW", changedByUserId: req.auth.sub, reason: "Recruiter interview scheduled" } });
      await tx.recruiterInterviewAudit.create({ data: { interviewId: created.id, actorId: req.auth.sub, action: "SCHEDULED", details: { timezone: input.timezone } } });
      return created;
    });
    await notifyParticipants(interview, "Interview scheduled", `${input.title} is scheduled for ${input.startsAt.toISOString()} (${input.timezone}).`);
    res.status(201).json({ data: serialize(interview) });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const prisma = getPrisma();
    const where = req.auth.role === "STUDENT"
      ? { participants: { some: { userId: req.auth.sub } } }
      : { company: { members: { some: { userId: req.auth.sub, active: true } } } };
    res.json({ data: (await prisma.recruiterInterview.findMany({ where, include: { rounds: true, participants: true, application: { include: { job: true } } }, orderBy: { scheduledStart: "asc" } })).map(serialize) });
  } catch (error) { next(error); }
});

router.get("/upcoming", async (req, res, next) => {
  try {
    const items = await getPrisma().recruiterInterview.findMany({ where: { participants: { some: { userId: req.auth.sub } }, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledStart: { gte: new Date() } }, include: { rounds: true, participants: true, application: { include: { job: true } } }, orderBy: { scheduledStart: "asc" } });
    res.json({ data: items.map(serialize) });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Interview not found." } });
    const memberAccess = await prisma.companyMember.findFirst({ where: { companyId: access.interview.companyId, userId: req.auth.sub, active: true } });
    if (!access.participant && !memberAccess) return res.status(403).json({ error: { code: "PARTICIPANT_ACCESS_DENIED", message: "You are not a participant in this interview." } });
    res.json({ data: serialize(access.interview) });
  } catch (error) { next(error); }
});

async function updateSchedule(req, res, next) {
  try {
    const prisma = getPrisma(); const input = changeInput.parse(req.body); validWindow(input.startsAt, input.endsAt);
    const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Interview not found." } });
    const company = await prisma.companyMember.findFirst({ where: { companyId: access.interview.companyId, userId: req.auth.sub, active: true } });
    const isCandidate = access.participant?.role === "CANDIDATE";
    if (!company && !access.participant || (!company && !isCandidate)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Interview access is required." } });
    if (isCandidate) {
      const request = await prisma.interviewRescheduleRequest.create({ data: { interviewId: access.interview.id, requestedById: req.auth.sub, proposedStart: input.startsAt, proposedEnd: input.endsAt, timezone: input.timezone, reason: input.reason } });
      await notifyParticipants(access.interview, "Interview reschedule requested", input.reason || "The candidate requested a new interview time.");
      return res.status(201).json({ data: request });
    }
    if (!canSchedule(company)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Hiring workflow access is required." } });
    if (["COMPLETED", "CANCELLED"].includes(access.interview.status)) fail("This interview can no longer be rescheduled.", 409, "INVALID_STATE");
    const updated = await prisma.recruiterInterview.update({ where: { id: access.interview.id }, data: { scheduledStart: input.startsAt, scheduledEnd: input.endsAt, timezone: input.timezone } });
    await prisma.recruiterInterviewAudit.create({ data: { interviewId: updated.id, actorId: req.auth.sub, action: "RESCHEDULED", details: { reason: input.reason || null } } });
    await notifyParticipants(access.interview, "Interview rescheduled", `The interview time has changed to ${input.startsAt.toISOString()} (${input.timezone}).`);
    res.json({ data: serialize(updated) });
  } catch (error) { next(error); }
}
router.patch("/:id/reschedule", updateSchedule);
router.post("/:id/request-reschedule", updateSchedule);

router.post("/:id/confirm", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access?.participant) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Interview not found." } });
    if (access.participant.role !== "CANDIDATE" && access.participant.role !== "INTERVIEWER") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Participant confirmation is required." } });
    const updated = await prisma.recruiterInterviewParticipant.update({ where: { id: access.participant.id }, data: { confirmedAt: new Date() } });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Interview not found." } });
    const company = await prisma.companyMember.findFirst({ where: { companyId: access.interview.companyId, userId: req.auth.sub, active: true } });
    if (!canManage(company) && access.participant?.role !== "CANDIDATE") return res.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot cancel this interview." } });
    assertTransition(access.interview.status, "CANCELLED");
    const updated = await prisma.recruiterInterview.update({ where: { id: access.interview.id }, data: { status: "CANCELLED", cancellationReason: req.body?.reason || null } });
    await prisma.recruiterInterviewAudit.create({ data: { interviewId: updated.id, actorId: req.auth.sub, action: "CANCELLED", details: { reason: req.body?.reason || null } } });
    await notifyParticipants(access.interview, "Interview cancelled", req.body?.reason || "The interview was cancelled.");
    res.json({ data: serialize(updated) });
  } catch (error) { next(error); }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const input = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]) }).parse(req.body);
    const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    const company = access && await prisma.companyMember.findFirst({ where: { companyId: access.interview.companyId, userId: req.auth.sub, active: true } });
    if (!access || !canSchedule(company)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Recruiter workflow access is required." } });
    assertTransition(access.interview.status, input.status);
    const updated = await prisma.recruiterInterview.update({ where: { id: access.interview.id }, data: { status: input.status } });
    await prisma.recruiterInterviewAudit.create({ data: { interviewId: updated.id, actorId: req.auth.sub, action: `STATUS_${input.status}`, details: {} } });
    res.json({ data: serialize(updated) });
  } catch (error) { next(error); }
});

router.post("/:id/reschedule-requests/:requestId/decision", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const input = z.object({ status: z.enum(["APPROVED", "DECLINED"]) }).parse(req.body);
    const request = await prisma.interviewRescheduleRequest.findUnique({ where: { id: req.params.requestId }, include: { interview: true } });
    const company = request && await prisma.companyMember.findFirst({ where: { companyId: request.interview.companyId, userId: req.auth.sub, active: true } });
    if (!request || request.interviewId !== req.params.id || !canSchedule(company)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Recruiter workflow access is required." } });
    if (request.status !== "PENDING") fail("This reschedule request has already been decided.", 409, "INVALID_STATE");
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.interviewRescheduleRequest.update({ where: { id: request.id }, data: { status: input.status, reviewedById: req.auth.sub, reviewedAt: new Date() } });
      if (input.status === "APPROVED") await tx.recruiterInterview.update({ where: { id: request.interviewId }, data: { scheduledStart: request.proposedStart, scheduledEnd: request.proposedEnd, timezone: request.timezone } });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.post("/:id/participants", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const input = z.object({ userId: z.string().uuid(), role: z.enum(["INTERVIEWER", "OBSERVER"]) }).parse(req.body);
    const interview = await prisma.recruiterInterview.findUnique({ where: { id: req.params.id } }); const company = interview && await prisma.companyMember.findFirst({ where: { companyId: interview.companyId, userId: req.auth.sub, active: true } });
    if (!interview || !canManage(company)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Interview not found." } });
    const member = await prisma.companyMember.findFirst({ where: { companyId: interview.companyId, userId: input.userId, active: true } });
    if (!member) return res.status(403).json({ error: { code: "PARTICIPANT_NOT_AUTHORIZED", message: "The interviewer is not an active company member." } });
    res.status(201).json({ data: await prisma.recruiterInterviewParticipant.create({ data: { interviewId: interview.id, userId: input.userId, role: input.role } }) });
  } catch (error) { next(error); }
});

router.get("/:id/workspace", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access || !["INTERVIEWER", "OBSERVER"].includes(access.participant?.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Interviewer access is required." } });
    res.json({ data: { interview: serialize(access.interview), scorecards: await prisma.recruiterScorecard.findMany({ where: { interviewId: access.interview.id }, include: { corrections: true } }) } });
  } catch (error) { next(error); }
});

router.post("/:id/scorecards", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const access = await interviewAccess(prisma, req.params.id, req.auth.sub);
    if (!access || access.participant?.role !== "INTERVIEWER") return res.status(403).json({ error: { code: "FORBIDDEN", message: "Assigned interviewer access is required." } });
    const input = z.object({ roundId: z.string().uuid().nullable().optional(), ratings: z.record(z.string(), z.number().min(0).max(100)), overallScore: z.number().min(0).max(100).nullable().optional(), recommendation: z.string().max(80).optional(), comments: z.string().max(10_000).optional(), submit: z.boolean().default(true) }).parse(req.body);
    const scorecard = await prisma.recruiterScorecard.upsert({ where: { interviewId_roundId_evaluatorId: { interviewId: access.interview.id, roundId: input.roundId || null, evaluatorId: req.auth.sub } }, update: { ratings: input.ratings, overallScore: input.overallScore, recommendation: input.recommendation, comments: input.comments, status: input.submit ? "SUBMITTED" : "DRAFT", submittedAt: input.submit ? new Date() : null }, create: { interviewId: access.interview.id, roundId: input.roundId || null, evaluatorId: req.auth.sub, ratings: input.ratings, overallScore: input.overallScore, recommendation: input.recommendation, comments: input.comments, status: input.submit ? "SUBMITTED" : "DRAFT", submittedAt: input.submit ? new Date() : null } });
    res.status(201).json({ data: scorecard });
  } catch (error) { next(error); }
});

router.post("/:id/scorecards/:scorecardId/finalize", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const scorecard = await prisma.recruiterScorecard.findUnique({ where: { id: req.params.scorecardId }, include: { interview: true } });
    const access = scorecard && await prisma.companyMember.findFirst({ where: { companyId: scorecard.interview.companyId, userId: req.auth.sub, active: true } });
    if (!scorecard || !canManage(access)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only hiring managers can finalize scorecards." } });
    if (scorecard.status !== "SUBMITTED" && scorecard.status !== "CORRECTED") fail("Only submitted scorecards can be finalized.", 409, "INVALID_STATE");
    const finalized = await prisma.recruiterScorecard.update({ where: { id: scorecard.id }, data: { status: "FINALIZED", finalizedAt: new Date(), finalizedById: req.auth.sub } });
    res.json({ data: finalized });
  } catch (error) { next(error); }
});

router.patch("/:id/scorecards/:scorecardId/correction", async (req, res, next) => {
  try {
    const prisma = getPrisma(); const input = z.object({ ratings: z.record(z.string(), z.number().min(0).max(100)), overallScore: z.number().min(0).max(100).nullable().optional(), reason: z.string().trim().min(5).max(1000) }).parse(req.body);
    const scorecard = await prisma.recruiterScorecard.findUnique({ where: { id: req.params.scorecardId }, include: { interview: true } }); const access = scorecard && await prisma.companyMember.findFirst({ where: { companyId: scorecard.interview.companyId, userId: req.auth.sub, active: true } });
    if (!scorecard || !canManage(access)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only hiring managers can correct scorecards." } });
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.recruiterScorecard.update({ where: { id: scorecard.id }, data: { ratings: input.ratings, overallScore: input.overallScore, status: "CORRECTED" } });
      await tx.recruiterScorecardCorrection.create({ data: { scorecardId: scorecard.id, correctedById: req.auth.sub, previous: { ratings: scorecard.ratings, overallScore: scorecard.overallScore }, corrected: { ratings: input.ratings, overallScore: input.overallScore }, reason: input.reason } });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.canSchedule = canSchedule;
module.exports.assertTransition = assertTransition;
module.exports.validWindow = validWindow;
