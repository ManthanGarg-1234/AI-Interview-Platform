"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { sendEmail } = require("./email");

const router = express.Router();
const preferenceSchema = z.object({ inApp: z.boolean(), email: z.boolean() });

async function createNotification({ userId, type = "SYSTEM", title, body, resourceType, resourceId, critical = false }) {
  const prisma = getPrisma();
  const [preference, user] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  if (!critical && preference && !preference.inApp) return null;
  const notification = await prisma.notification.create({ data: { userId, type, title, body, resourceType, resourceId } });
  if (preference?.email && user?.email) await sendEmail({ to: user.email, subject: title, text: body });
  return notification;
}

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const where = { userId: req.auth.sub };
    const [items, total, unread] = await Promise.all([
      getPrisma().notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      getPrisma().notification.count({ where }),
      getPrisma().notification.count({ where: { ...where, readAt: null } }),
    ]);
    res.json({ data: { items, page, limit, total, unread } });
  } catch (error) { next(error); }
});

router.get("/preferences", async (req, res, next) => {
  try {
    const preference = await getPrisma().notificationPreference.upsert({ where: { userId: req.auth.sub }, update: {}, create: { userId: req.auth.sub } });
    res.json({ data: preference });
  } catch (error) { next(error); }
});

router.put("/preferences", async (req, res, next) => {
  try {
    const input = preferenceSchema.parse(req.body);
    res.json({ data: await getPrisma().notificationPreference.upsert({ where: { userId: req.auth.sub }, update: input, create: { userId: req.auth.sub, ...input } }) });
  } catch (error) { next(error); }
});

router.post("/:id/read", async (req, res, next) => {
  try {
    const notification = await getPrisma().notification.updateMany({ where: { id: req.params.id, userId: req.auth.sub }, data: { readAt: new Date() } });
    if (!notification.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post("/read-all", async (req, res, next) => {
  try { await getPrisma().notification.updateMany({ where: { userId: req.auth.sub, readAt: null }, data: { readAt: new Date() } }); res.status(204).send(); } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await getPrisma().notification.deleteMany({ where: { id: req.params.id, userId: req.auth.sub } });
    if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = { router, createNotification };
