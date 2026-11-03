"use strict";

const express = require("express");
const { z } = require("zod");
const { register, login, refresh, logout, authenticate, requireRole, csrfProtection, publicUser } = require("./auth");
const { getPrisma } = require("./prisma");

const router = express.Router();
router.use(express.json({ limit: "256kb" }));
router.get("/health", async (_req, res) => {
  let database = "not_configured";
  if (process.env.DATABASE_URL) {
    try { await getPrisma().$queryRaw`SELECT 1`; database = "ready"; }
    catch { database = "unavailable"; }
  }
  res.status(database === "unavailable" ? 503 : 200).json({ ok: database !== "unavailable", service: "api", database, redis: process.env.REDIS_URL ? "configured" : "not_configured" });
});
router.post("/auth/register", async (req, res, next) => { try { await register(req, res); } catch (error) { next(error); } });
router.post("/auth/login", async (req, res, next) => { try { await login(req, res); } catch (error) { next(error); } });
router.post("/auth/refresh", async (req, res, next) => { try { await refresh(req, res); } catch (error) { next(error); } });
router.post("/auth/logout", async (req, res, next) => { try { await logout(req, res); } catch (error) { next(error); } });
router.use(csrfProtection);
router.get("/auth/me", authenticate, async (req, res, next) => {
  try {
    const user = await getPrisma().user.findUnique({ where: { id: req.auth.sub }, include: { studentProfile: true, recruiterProfile: true } });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Your session is no longer active." } });
    res.json({ data: publicUser(user) });
  } catch (error) { next(error); }
});
router.get("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, include: { skills: true, educations: true, projects: true } }); res.json({ data: profile }); }
  catch (error) { next(error); }
});
router.patch("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const data = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), headline: z.string().trim().max(180).nullable().optional(), bio: z.string().trim().max(5000).nullable().optional(), location: z.string().trim().max(160).nullable().optional(), discoverable: z.boolean().optional() }).parse(req.body);
    const profile = await getPrisma().studentProfile.update({ where: { userId: req.auth.sub }, data });
    res.json({ data: profile });
  } catch (error) { next(error); }
});

module.exports = router;
