"use strict";

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const tokenSecret = () => process.env.WEBRTC_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET || "development-only-change-me";
const tokenTtlMs = () => Math.min(Math.max(Number(process.env.WEBRTC_TOKEN_TTL_MS || 15 * 60 * 1000), 60 * 1000), 60 * 60 * 1000);
const signalSchema = z.object({
  to: z.string().uuid(),
  description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(200000) }).optional(),
  candidate: z.object({ candidate: z.string().min(1).max(10000), sdpMid: z.string().nullable().optional(), sdpMLineIndex: z.number().int().nullable().optional() }).optional(),
}).refine((value) => value.description || value.candidate, "A description or ICE candidate is required.");

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canJoinInterview(interview, now = new Date()) {
  if (!["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(interview.status) || !interview.scheduledStart || !interview.scheduledEnd) return false;
  const startsAt = new Date(interview.scheduledStart).getTime();
  const endsAt = new Date(interview.scheduledEnd).getTime();
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && now.getTime() >= startsAt - 15 * 60 * 1000 && now.getTime() <= endsAt;
}
function signRoomToken({ roomId, userId, role }) {
  return jwt.sign({ roomId, role, typ: "webrtc-room" }, tokenSecret(), { subject: userId, expiresIn: Math.floor(tokenTtlMs() / 1000), issuer: "careerprepai-webrtc" });
}
function verifyRoomToken(token) {
  return jwt.verify(token, tokenSecret(), { issuer: "careerprepai-webrtc" });
}
function iceServers() {
  const servers = [{ urls: process.env.WEBRTC_STUN_URL || "stun:stun.l.google.com:19302" }];
  if (process.env.WEBRTC_TURN_URL && process.env.WEBRTC_TURN_USERNAME && process.env.WEBRTC_TURN_CREDENTIAL) {
    servers.push({ urls: process.env.WEBRTC_TURN_URL, username: process.env.WEBRTC_TURN_USERNAME, credential: process.env.WEBRTC_TURN_CREDENTIAL });
  }
  return servers;
}

async function findMembership(prisma, roomId, userId) {
  return prisma.liveInterviewRoom.findUnique({
    where: { id: roomId },
    include: { interview: { select: {
      id: true,
      status: true,
      createdByUserId: true,
      scheduledStart: true,
      scheduledEnd: true,
      participants: { where: { userId }, select: { role: true } },
    } } },
  });
}
async function issueRoomToken({ roomId, userId, consent }) {
  if (consent !== true) { const error = new Error("Explicit camera and microphone consent is required."); error.status = 400; error.code = "MEDIA_CONSENT_REQUIRED"; throw error; }
  const prisma = getPrisma();
  const room = await findMembership(prisma, roomId, userId);
  if (!room || room.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(room.status)) { const error = new Error("This interview room is unavailable."); error.status = 404; throw error; }
  if (!canJoinInterview(room.interview)) { const error = new Error("This interview is not currently open for joining."); error.status = 403; error.code = "INTERVIEW_NOT_JOINABLE"; throw error; }
  const member = room.interview.participants[0];
  if (!member && room.interview.createdByUserId !== userId) { const error = new Error("You are not a participant in this interview."); error.status = 403; throw error; }
  const role = member?.role || "INTERVIEWER";
  const raw = signRoomToken({ roomId, userId, role });
  const expiresAt = new Date(Date.now() + tokenTtlMs());
  await prisma.$transaction([
    prisma.liveInterviewRoomToken.create({ data: { roomId, userId, tokenHash: hash(raw), expiresAt } }),
    prisma.consentRecord.create({ data: { userId, type: "MEDIA_DEVICE", status: "GRANTED", scope: { roomId, camera: true, microphone: true, screenShare: false }, policyVersion: process.env.MEDIA_CONSENT_POLICY_VERSION || "1.0", grantedAt: new Date(), expiresAt, source: "webrtc-room" } }),
  ]);
  return { token: raw, roomId, role, expiresAt, iceServers: iceServers() };
}

function attachSignaling(io) {
  io.use(async (socket, next) => {
    try {
      const rawToken = socket.handshake.auth?.token;
      const claims = verifyRoomToken(rawToken);
      if (claims.typ !== "webrtc-room") throw new Error("Invalid room token.");
      const prisma = getPrisma();
      const [room, token] = await Promise.all([
        findMembership(prisma, claims.roomId, claims.sub),
        prisma.liveInterviewRoomToken.findUnique({ where: { tokenHash: hash(rawToken) }, select: { userId: true, expiresAt: true, revokedAt: true } }),
      ]);
      if (!room || room.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(room.status)) throw new Error("Room token is expired or revoked.");
      if (!canJoinInterview(room.interview)) throw new Error("Interview is not currently open.");
      if (!token || token.userId !== claims.sub || token.revokedAt || token.expiresAt <= new Date()) throw new Error("Room token is revoked or expired.");
      if (!room.interview.participants.length && room.interview.createdByUserId !== claims.sub) throw new Error("Room membership is required.");
      socket.roomClaims = claims;
      next();
    } catch (error) { next(Object.assign(new Error("Room authorization failed."), { data: { code: "ROOM_UNAUTHORIZED" }, cause: error })); }
  });
  io.on("connection", (socket) => {
    const { roomId, sub: userId } = socket.roomClaims;
    socket.join(roomId);
    socket.join(`${roomId}:${userId}`);
    const prisma = getPrisma();
    prisma.$transaction(async (tx) => {
      const currentRoom = await tx.liveInterviewRoom.findUnique({ where: { id: roomId }, select: { interviewId: true, expiresAt: true, status: true } });
      if (!currentRoom || currentRoom.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(currentRoom.status)) {
        throw new Error("Interview room is no longer available.");
      }
      const interviewUpdate = await tx.recruiterInterview.updateMany({
        where: { id: currentRoom.interviewId, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
        data: { status: "IN_PROGRESS" },
      });
      if (interviewUpdate.count !== 1) throw new Error("Interview is no longer open.");
      await tx.liveInterviewParticipant.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, role: socket.roomClaims.role, socketId: socket.id, joinedAt: new Date() },
        update: { role: socket.roomClaims.role, socketId: socket.id, joinedAt: new Date(), leftAt: null },
      });
      await tx.liveInterviewRoom.update({ where: { id: roomId }, data: { status: "ACTIVE", startedAt: new Date() } });
      return tx.liveInterviewParticipant.findMany({ where: { roomId, leftAt: null, socketId: { not: null } }, select: { userId: true } });
    }).then((active) => {
      socket.emit("room:participants", { participantIds: active.map(({ userId: participantId }) => participantId) });
      socket.to(roomId).emit("participant:joined", { participantId: userId });
    }).catch(() => {
      socket.emit("room:error", { code: "ROOM_UNAVAILABLE" });
      socket.disconnect(true);
    });
    socket.on("signal:offer", (payload, acknowledge) => relay(socket, "signal:offer", payload, acknowledge));
    socket.on("signal:answer", (payload, acknowledge) => relay(socket, "signal:answer", payload, acknowledge));
    socket.on("signal:ice", (payload, acknowledge) => relay(socket, "signal:ice", payload, acknowledge));
    socket.on("room:complete", async (acknowledge) => {
      try {
        const room = await findMembership(prisma, roomId, userId);
        const isInterviewer = room?.interview.participants.some(({ role }) => role === "INTERVIEWER");
        if (!room || room.interview.status !== "IN_PROGRESS" || (room.interview.createdByUserId !== userId && !isInterviewer)) {
          if (acknowledge) acknowledge({ ok: false, code: "FORBIDDEN" });
          return;
        }
        await prisma.$transaction(async (tx) => {
          const roomUpdate = await tx.liveInterviewRoom.updateMany({ where: { id: roomId, status: "ACTIVE" }, data: { status: "COMPLETED", completedAt: new Date() } });
          const interviewUpdate = await tx.recruiterInterview.updateMany({ where: { id: room.interview.id, status: "IN_PROGRESS" }, data: { status: "COMPLETED" } });
          if (roomUpdate.count !== 1 || interviewUpdate.count !== 1) throw new Error("Interview is no longer active.");
          await tx.liveInterviewRoomToken.updateMany({ where: { roomId, revokedAt: null }, data: { revokedAt: new Date() } });
        });
        io.to(roomId).emit("room:completed");
        if (acknowledge) acknowledge({ ok: true });
      } catch {
        if (acknowledge) acknowledge({ ok: false, code: "COMPLETION_FAILED" });
      }
    });
    socket.on("disconnect", async () => {
      const result = await prisma.liveInterviewParticipant.updateMany({ where: { roomId, userId, socketId: socket.id }, data: { leftAt: new Date(), socketId: null } }).catch(() => ({ count: 0 }));
      if (result.count) socket.to(roomId).emit("participant:left", { participantId: userId });
    });
  });
  function relay(socket, event, payload, acknowledge) {
    const parsed = signalSchema.safeParse(payload);
    if (!parsed.success) { if (acknowledge) acknowledge({ ok: false, code: "INVALID_SIGNAL" }); return; }
    const { roomId, sub: userId } = socket.roomClaims;
    if (parsed.data.to === userId) { if (acknowledge) acknowledge({ ok: false, code: "INVALID_RECIPIENT" }); return; }
    getPrisma().liveInterviewParticipant.findFirst({
      where: { roomId, userId: parsed.data.to, leftAt: null, socketId: { not: null } },
      select: { userId: true },
    }).then((recipient) => {
      if (!recipient) { if (acknowledge) acknowledge({ ok: false, code: "RECIPIENT_UNAVAILABLE" }); return; }
      io.to(`${roomId}:${recipient.userId}`).emit(event, { from: userId, ...parsed.data });
      if (acknowledge) acknowledge({ ok: true });
    }).catch(() => { if (acknowledge) acknowledge({ ok: false, code: "SIGNAL_FAILED" }); });
  }
  return io;
}

module.exports = { attachSignaling, canJoinInterview, findMembership, iceServers, issueRoomToken, signRoomToken, verifyRoomToken, signalSchema, tokenTtlMs };
