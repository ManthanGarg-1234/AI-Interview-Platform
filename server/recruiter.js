"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const router = express.Router();
const companySchema = z.object({ name: z.string().trim().min(2).max(200), website: z.string().url().max(500).nullable().optional(), description: z.string().max(10_000).nullable().optional() });

async function member(userId, companyId) {
  return getPrisma().companyMember.findFirst({ where: { userId, companyId, active: true }, include: { company: true } });
}

router.get("/profile", async (req, res, next) => {
  try { res.json({ data: await getPrisma().recruiterProfile.findUnique({ where: { userId: req.auth.sub } }) }); } catch (error) { next(error); }
});

router.post("/companies", async (req, res, next) => {
  try {
    const input = companySchema.parse(req.body);
    const company = await getPrisma().$transaction(async (tx) => {
      const created = await tx.company.create({ data: input });
      await tx.companyMember.create({ data: { companyId: created.id, userId: req.auth.sub, role: "OWNER", acceptedAt: new Date() } });
      return created;
    });
    res.status(201).json({ data: company });
  } catch (error) { next(error); }
});

router.get("/companies", async (req, res, next) => {
  try { res.json({ data: await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, include: { members: true, verifications: { orderBy: { submittedAt: "desc" }, take: 1 } } }) }); } catch (error) { next(error); }
});

router.post("/companies/:id/verification", async (req, res, next) => {
  try {
    const access = await member(req.auth.sub, req.params.id);
    if (!access || !["OWNER", "HIRING_MANAGER"].includes(access.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Company owner access is required." } });
    const verification = await getPrisma().companyVerification.create({ data: { companyId: req.params.id, submittedByUserId: req.auth.sub, status: "PENDING_VERIFICATION", note: req.body.note || null } });
    res.status(201).json({ data: verification });
  } catch (error) { next(error); }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const companies = await getPrisma().company.findMany({ where: { members: { some: { userId: req.auth.sub, active: true } } }, select: { id: true } });
    const companyIds = companies.map((company) => company.id);
    const [jobs, applications, interviews] = await Promise.all([getPrisma().job.count({ where: { companyId: { in: companyIds }, status: "PUBLISHED" } }), getPrisma().application.count({ where: { job: { companyId: { in: companyIds } } } }), getPrisma().interviewSession.count({ where: { application: { job: { companyId: { in: companyIds } } } } })]);
    res.json({ data: { companies: companyIds.length, activeJobs: jobs, applications, interviews } });
  } catch (error) { next(error); }
});

module.exports = router;
