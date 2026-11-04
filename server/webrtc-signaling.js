"use strict";

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const tokenSecret = () => process.env.WEBRTC_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET || "development-only-change-me";
const tokenTtlMs = () => Math.min(Math.max(Number(process.env.WEBRTC_TOKEN_TTL_MS || 15 * 60 * 1000), 60 * 1000), 60 * 60 * 1000);
const signalSchema = z.object({
  to: z.string().uuid().optional(),
  description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(200000) }).optional(),
  candidate: z.object({ candidate: z.string().max(10000), sdpMid: z.string().nullable().optional(), sdpMLineIndex: z.number().int().nullable().optional() }).optional(),
}).refine((value) => value.description || value.candidate, "A description or ICE candidate is required.");

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
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
    include: { interview: { select: { id: true, status: true, createdByUserId: true } }, participants: { where: { userId }, select: { role: true } } },
  });
}
async function issueRoomToken({ roomId, userId, consent }) {
  if (consent !== true) { const error = new Error("Explicit camera and microphone consent is required."); error.status = 400; error.code = "MEDIA_CONSENT_REQUIRED"; throw error; }
  const prisma = getPrisma();
  const room = await findMembership(prisma, roomId, userId);
  if (!room || room.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(room.status)) { const error = new Error("This interview room is unavailable."); error.status = 404; throw error; }
  const member = room.participants[0];
  if (!member && room.interview.createdByUserId !== userId) { const error = new Error("You are not a participant in this interview."); error.status = 403; throw error; }
  const role = member?.role || "INTERVIEWER";
  const raw = signRoomToken({ roomId, userId, role });
  await prisma.$transaction([
    prisma.liveInterviewRoomToken.create({ data: { roomId, userId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + tokenTtlMs()) } }),
    prisma.consentRecord.create({ data: { userId, type: "MEDIA_DEVICE", status: "GRANTED", scope: { roomId, camera: true, microphone: true, screenShare: false }, policyVersion: process.env.MEDIA_CONSENT_POLICY_VERSION || "1.0", grantedAt: new Date(), expiresAt: new Date(Date.now() + tokenTtlMs()), source: "webrtc-room" } }),
  ]);
  return { token: raw, roomId, role, expiresAt: new Date(Date.now() + tokenTtlMs()), iceServers: iceServers() };
}

function attachSignaling(io) {
  io.use(async (socket, next) => {
    try {
      const claims = verifyRoomToken(socket.handshake.auth?.token);
      if (claims.typ !== "webrtc-room") throw new Error("Invalid room token.");
      const room = await findMembership(getPrisma(), claims.roomId, claims.sub);
      if (!room || room.expiresAt <= new Date() || ["COMPLETED", "EXPIRED"].includes(room.status)) throw new Error("Room token is expired or revoked.");
      if (!room.participants.length && room.interview.createdByUserId !== claims.sub) throw new Error("Room membership is required.");
      socket.roomClaims = claims;
      next();
    } catch (error) { next(Object.assign(new Error("Room authorization failed."), { data: { code: "ROOM_UNAUTHORIZED" }, cause: error })); }
  });
  io.on("connection", (socket) => {
    const { roomId, sub: userId } = socket.roomClaims;
    socket.join(roomId);
    const prisma = getPrisma();
    prisma.liveInterviewParticipant.upsert({ where: { roomId_userId: { roomId, userId } }, create: { roomId, userId, role: socket.roomClaims.role, socketId: socket.id, joinedAt: new Date() }, update: { socketId: socket.id, joinedAt: new Date(), leftAt: null } }).then(async () => {
      await prisma.liveInterviewRoom.update({ where: { id: roomId }, data: { status: "ACTIVE", startedAt: new Date(), interview: { update: { status: "IN_PROGRESS" } } } });
      socket.to(roomId).emit("participant:joined", { participantId: userId });
    }).catch(() => socket.disconnect(true));
    socket.on("signal:offer", (payload, acknowledge) => relay(socket, "signal:offer", payload, acknowledge));
    socket.on("signal:answer", (payload, acknowledge) => relay(socket, "signal:answer", payload, acknowledge));
    socket.on("signal:ice", (payload, acknowledge) => relay(socket, "signal:ice", payload, acknowledge));
    socket.on("room:complete", async (acknowledge) => {
      await prisma.liveInterviewRoom.update({ where: { id: roomId }, data: { status: "COMPLETED", completedAt: new Date(), interview: { update: { status: "COMPLETED" } } } }).catch(() => {});
      socket.to(roomId).emit("room:completed");
      if (acknowledge) acknowledge({ ok: true });
    });
    socket.on("disconnect", async () => {
      await prisma.liveInterviewParticipant.updateMany({ where: { roomId, userId, socketId: socket.id }, data: { leftAt: new Date(), socketId: null } }).catch(() => {});
      socket.to(roomId).emit("participant:left", { participantId: userId });
    });
  });
  function relay(socket, event, payload, acknowledge) {
    const parsed = signalSchema.safeParse(payload);
    if (!parsed.success) { if (acknowledge) acknowledge({ ok: false, code: "INVALID_SIGNAL" }); return; }
    socket.to(socket.roomClaims.roomId).emit(event, { from: socket.roomClaims.sub, ...parsed.data });
    if (acknowledge) acknowledge({ ok: true });
  }
  return io;
}

module.exports = { attachSignaling, findMembership, iceServers, issueRoomToken, signRoomToken, verifyRoomToken, signalSchema, tokenTtlMs };
