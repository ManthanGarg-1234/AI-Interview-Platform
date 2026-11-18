"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { canJoinInterview, issueRoomToken, iceServers } = require("./webrtc-signaling");

const router = express.Router();
const roomIdSchema = z.string().uuid();

async function authorizeInterview(prisma, interviewId, userId) {
  const interview = await prisma.recruiterInterview.findUnique({ where: { id: interviewId }, include: { participants: true } });
  if (!interview) { const error = new Error("Interview was not found."); error.status = 404; throw error; }
  const allowed = interview.createdByUserId === userId || interview.participants.some((participant) => participant.userId === userId);
  if (!allowed) { const error = new Error("You are not authorized for this interview."); error.status = 403; throw error; }
  return interview;
}

router.post("/:interviewId/room", async (req, res, next) => {
  try {
    const interviewId = roomIdSchema.parse(req.params.interviewId);
    const prisma = getPrisma();
    const interview = await authorizeInterview(prisma, interviewId, req.auth.sub);
    if (req.body?.consent !== true) { const error = new Error("Explicit camera and microphone consent is required."); error.status = 400; error.code = "MEDIA_CONSENT_REQUIRED"; throw error; }
    if (!canJoinInterview(interview)) { const error = new Error("This interview is not currently open for joining."); error.status = 403; error.code = "INTERVIEW_NOT_JOINABLE"; throw error; }
    const existingRoom = await prisma.liveInterviewRoom.findUnique({ where: { interviewId }, select: { id: true, expiresAt: true, status: true } });
    if (existingRoom && (existingRoom.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(existingRoom.status))) {
      const error = new Error("This interview room is unavailable."); error.status = 409; error.code = "ROOM_UNAVAILABLE"; throw error;
    }
    const expiresAt = new Date(Date.now() + Number(process.env.WEBRTC_ROOM_TTL_MS || 4 * 60 * 60 * 1000));
    const room = await prisma.liveInterviewRoom.upsert({
      where: { interviewId },
      create: { interviewId, expiresAt, participants: { create: interview.participants.map(({ userId, role }) => ({ userId, role })) } },
      update: {},
      include: { participants: true },
    });
    const access = await issueRoomToken({ roomId: room.id, userId: req.auth.sub, consent: req.body?.consent === true });
    res.status(201).json({ data: { roomId: room.id, interviewId, status: room.status, expiresAt: room.expiresAt, ...access } });
  } catch (error) { next(error); }
});

router.post("/:interviewId/room/token", async (req, res, next) => {
  try {
    const interviewId = roomIdSchema.parse(req.params.interviewId);
    const room = await getPrisma().liveInterviewRoom.findUnique({ where: { interviewId }, select: { id: true } });
    if (!room) { const error = new Error("The live interview room has not been created."); error.status = 404; throw error; }
    const access = await issueRoomToken({ roomId: room.id, userId: req.auth.sub, consent: req.body?.consent === true });
    res.json({ data: access });
  } catch (error) { next(error); }
});

router.get("/:interviewId/room", async (req, res, next) => {
  try {
    const interviewId = roomIdSchema.parse(req.params.interviewId);
    const room = await getPrisma().liveInterviewRoom.findUnique({ where: { interviewId }, include: { participants: { select: { userId: true, role: true, joinedAt: true, leftAt: true } } } });
    if (!room) return res.status(404).json({ error: { code: "ROOM_NOT_FOUND", message: "The live interview room has not been created." } });
    await authorizeInterview(getPrisma(), interviewId, req.auth.sub);
    res.json({ data: { id: room.id, status: room.status, expiresAt: room.expiresAt, participants: room.participants, iceServers: iceServers() } });
  } catch (error) { next(error); }
});

module.exports = router;
