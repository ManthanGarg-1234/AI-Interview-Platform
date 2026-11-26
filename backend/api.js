"use strict";

const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const multer = require("multer");
const { z } = require("zod");
const Redis = require("ioredis");
const {
  register, resendVerification, verifyEmail, requestPasswordReset, resetPassword, changePassword,
  startGoogleOAuth, completeGoogleOAuth,
  firebaseGoogleAuth,
  login, refresh, logout, logoutAll, listSessions, revokeSession,
  currentCsrfToken, authenticate, requireRole, csrfProtection, publicUser,
} = require("./auth");
const { authRateLimit } = require("./middleware/auth-rate-limit");
const { getPrisma, checkDatabase } = require("./prisma");
const { expireOffers } = require("./offer-expiry");
const storage = require("./private-storage");
const { enqueueResumeProcessing } = require("./resume-processing");
const { enqueueResumeAnalysis, processResumeAnalysis, resumeAnalysisInputSchema } = require("./resume-analysis");
const coding = require("./coding");
const codingLibrary = require("./coding-library");
const codingLibraryAdmin = require("./coding-library-admin");
const interview = require("./interview");
const performance = require("./performance");
const notifications = require("./notifications");
const admin = require("./admin");
const recruiter = require("./recruiter");
const recruiterInterviews = require("./recruiter-interviews");
const jobs = require("./jobs");
const liveInterviews = require("./live-interviews");
const llm = require("./llm/provider");
const subjects = require("./subjects");
const targetRoles = require("./target-roles");
const dsaSheets = require("./dsa-sheets");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimetype)),
});
function validResumePayload(file) {
  if (!file) return false;
  const extension = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === "application/pdf") return extension === ".pdf" && file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extension === ".docx" && file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      && file.buffer.includes(Buffer.from("[Content_Types].xml")) && file.buffer.includes(Buffer.from("word/document.xml"));
  }
  return false;
}
router.use(express.json({ limit: "256kb" }));
router.use(csrfProtection);
router.get("/health", async (_req, res) => {
  async function checkRedis() {
    if (!process.env.REDIS_URL) return "not_configured";
    let redis;
    try {
      redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1500,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      redis.on("error", () => {});
      await redis.connect();
      await redis.ping();
      return "ready";
    } catch {
      return "unavailable";
    } finally {
      redis?.disconnect();
    }
  }

  const [database, redis] = await Promise.all([
    process.env.DATABASE_URL ? checkDatabase().then(() => "ready", () => "unavailable") : "not_configured",
    checkRedis(),
  ]);
  const ok = database !== "unavailable" && redis !== "unavailable";
  res.status(ok ? 200 : 503).json({ ok, service: "api", database, redis });
});
const authHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const registrationLimit = authRateLimit({ name: "register", windowSeconds: 3600, ipLimit: 120, accountLimit: 5 });
const loginLimit = authRateLimit({ name: "login", windowSeconds: 900, ipLimit: 120, accountLimit: 8 });
const refreshLimit = authRateLimit({ name: "refresh", windowSeconds: 900, ipLimit: 120, accountLimit: 60, accountSource: "refresh" });
const verificationLimit = authRateLimit({ name: "verify-email", windowSeconds: 900, ipLimit: 60, accountLimit: 10, accountSource: "token" });
const resendVerificationLimit = authRateLimit({ name: "resend-verification", windowSeconds: 3600, ipLimit: 30, accountLimit: 3 });
const passwordResetRequestLimit = authRateLimit({ name: "password-reset-request", windowSeconds: 3600, ipLimit: 30, accountLimit: 5 });
const passwordResetConfirmLimit = authRateLimit({ name: "password-reset-confirm", windowSeconds: 900, ipLimit: 60, accountLimit: 10, accountSource: "token" });
const passwordChangeLimit = authRateLimit({ name: "password-change", windowSeconds: 3600, ipLimit: 60, accountLimit: 10, accountSource: "user" });
const googleOAuthStartLimit = authRateLimit({ name: "google-oauth-start", windowSeconds: 900, ipLimit: 30, accountLimit: 30 });

router.use("/auth", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.get("/auth/csrf", authHandler(currentCsrfToken));
router.post("/auth/register/student", registrationLimit, authHandler((req, res) => register(req, res, "STUDENT")));
router.post("/auth/register/recruiter", registrationLimit, authHandler((req, res) => register(req, res, "RECRUITER")));
router.post("/auth/register", registrationLimit, authHandler((req, res) => register(req, res)));
router.post("/auth/resend-verification", resendVerificationLimit, authHandler(resendVerification));
router.post("/auth/verify-email", verificationLimit, authHandler(verifyEmail));
router.post("/auth/password-reset/request", passwordResetRequestLimit, authHandler(requestPasswordReset));
router.post("/auth/password-reset/confirm", passwordResetConfirmLimit, authHandler(resetPassword));
router.post("/auth/password/change", authenticate, passwordChangeLimit, authHandler(changePassword));
router.post("/auth/google/start", googleOAuthStartLimit, authHandler(startGoogleOAuth));
router.get("/auth/google/callback", authHandler(completeGoogleOAuth));
router.post("/auth/firebase/google", googleOAuthStartLimit, authHandler(firebaseGoogleAuth));
router.post("/auth/login", loginLimit, authHandler(login));
router.post("/auth/refresh", refreshLimit, authHandler(refresh));
router.post("/auth/logout", authHandler(logout));
router.post("/auth/logout-all", authenticate, authHandler(logoutAll));
router.get("/auth/sessions", authenticate, authHandler(listSessions));
router.delete("/auth/sessions/:sessionId", authenticate, authHandler(revokeSession));
router.get("/auth/me", authenticate, (req, res) => res.json({ data: publicUser(req.user) }));
router.get("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, include: { skills: { include: { skill: true } }, educations: true, projects: true, experiences: true, certifications: true, user: { select: { profileImageUrl: true } } } }); res.json({ data: profile }); }
  catch (error) { next(error); }
});
router.patch("/me/profile", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const url = z.string().url().max(500).nullable().optional();
    const imageUrl = z.string().url().max(2048).refine((value) => new URL(value).protocol === "https:", "Profile picture URL must use HTTPS.").nullable().optional();
    const secureUrl = url.refine((value) => value == null || new URL(value).protocol === "https:", "URL must use HTTPS.");
    const data = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), phone: z.string().trim().max(32).nullable().optional(), headline: z.string().trim().max(180).nullable().optional(), bio: z.string().trim().max(5000).nullable().optional(), location: z.string().trim().max(160).nullable().optional(), githubUrl: secureUrl, linkedinUrl: secureUrl, portfolioUrl: secureUrl, profileImageUrl: imageUrl, discoverable: z.boolean().optional() }).parse(req.body);
    const prisma = getPrisma();
    const { profileImageUrl, ...profileData } = data;
    const profile = await prisma.$transaction(async (tx) => {
      const current = await tx.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true, firstName: true, lastName: true, headline: true, discoverable: true } });
      if (!current) throw Object.assign(new Error("Student profile was not found."), { status: 404, code: "PROFILE_NOT_FOUND" });
      const updated = await tx.studentProfile.update({ where: { userId: req.auth.sub }, data: profileData });
      if (profileImageUrl !== undefined) await tx.user.update({ where: { id: req.auth.sub }, data: { profileImageUrl } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: "STUDENT_PROFILE_UPDATED", resourceType: "STUDENT_PROFILE", resourceId: current.id, before: { firstName: current.firstName, lastName: current.lastName, headline: current.headline, discoverable: current.discoverable }, after: { firstName: updated.firstName, lastName: updated.lastName, headline: updated.headline, discoverable: updated.discoverable, profileImageUpdated: profileImageUrl !== undefined }, requestId: req.requestId || "student-profile-update", ipAddress: req.ip } });
      await tx.studentActivity.create({ data: { studentProfileId: current.id, activityType: "PROFILE_UPDATED", metadata: {} } });
      return updated;
    });
    res.json({ data: profile });
  } catch (error) { next(error); }
});
router.get("/me/offers", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json({ data: await getPrisma().offer.findMany({
      where: { studentUserId: req.auth.sub },
      include: { job: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
    }) });
  } catch (error) { next(error); }
});
router.get("/me/offers/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const offer = await getPrisma().offer.findFirst({
      where: { id: req.params.id, studentUserId: req.auth.sub },
      include: { job: { include: { company: true } }, application: true },
    });
    if (!offer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Offer not found." } });
    res.json({ data: offer });
  } catch (error) { next(error); }
});
router.post("/me/offers/:id/respond", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["ACCEPTED", "REJECTED"]), reason: z.string().trim().max(1000).optional() }).parse(req.body);
    const prisma = getPrisma();
    const offer = await prisma.offer.findFirst({ where: { id: req.params.id, studentUserId: req.auth.sub }, include: { application: { include: { job: true } } } });
    if (!offer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Offer not found." } });
    if (offer.status === input.status) return res.json({ data: offer });
    if (["ACCEPTED", "REJECTED", "EXPIRED"].includes(offer.status)) return res.status(409).json({ error: { code: "INVALID_OFFER_STATE", message: "This offer has already been resolved." } });
    if (offer.status !== "SENT") return res.status(409).json({ error: { code: "INVALID_OFFER_STATE", message: "Only sent offers can be responded to." } });
    if (offer.expiresAt <= new Date()) {
      await expireOffers();
      return res.status(409).json({ error: { code: "OFFER_EXPIRED", message: "This offer has expired." } });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.auth.sub}))`;
      const current = await tx.offer.findUnique({ where: { id: offer.id } });
      if (input.status === "ACCEPTED" && current.status !== "ACCEPTED") {
        const accepted = await tx.offer.findFirst({ where: { studentUserId: req.auth.sub, status: "ACCEPTED", id: { not: offer.id } }, select: { id: true } });
        if (accepted) {
          const error = new Error("You have already accepted an offer");
          error.status = 409;
          error.code = "OFFER_ALREADY_ACCEPTED";
          throw error;
        }
      }
      if (current.status === input.status) return current;
      const result = await tx.offer.updateMany({
        where: { id: offer.id, studentUserId: req.auth.sub, status: "SENT", expiresAt: { gt: new Date() } },
        data: { status: input.status, responseReason: input.reason, respondedAt: new Date() },
      });
      if (!result.count) {
        const current = await tx.offer.findUnique({ where: { id: offer.id } });
        if (current?.status === input.status) return current;
        const error = new Error(current?.status === "EXPIRED" ? "This offer has expired." : "This offer has already been resolved.");
        error.status = 409; error.code = current?.status === "EXPIRED" ? "OFFER_EXPIRED" : "INVALID_OFFER_STATE"; throw error;
      }
      const nextApplicationStatus = input.status === "ACCEPTED" ? "HIRED" : "REJECTED";
      await tx.application.update({ where: { id: offer.applicationId }, data: { status: nextApplicationStatus } });
      await tx.applicationStageHistory.create({ data: { applicationId: offer.applicationId, fromStatus: "OFFER_RELEASED", toStatus: nextApplicationStatus, changedByUserId: req.auth.sub, reason: input.reason || `Candidate ${input.status.toLowerCase()} the offer` } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action: `OFFER_${input.status}`, resourceType: "OFFER", resourceId: offer.id, before: { status: "SENT" }, after: { status: input.status, reason: input.reason || null }, requestId: req.requestId || "student-offer-response" } });
      await tx.notification.create({ data: { userId: offer.createdByUserId, type: "APPLICATION", title: `Offer ${input.status.toLowerCase()}`, body: `The candidate ${input.status.toLowerCase()} the offer for ${offer.application.job.title}.`, resourceType: "OFFER", resourceId: offer.id } });
      return tx.offer.findUnique({ where: { id: offer.id } });
    });
    await recruiter.invalidateRecruiterCache([offer.application.job.companyId]);
    res.json({ data: updated });
  } catch (error) { next(error); }
});

const profileSections = {
  education: { model: "education", schema: z.object({ institution: z.string().trim().min(1).max(200), degree: z.string().trim().max(160).nullable().optional(), fieldOfStudy: z.string().trim().max(160).nullable().optional(), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional(), graduationYear: z.coerce.number().int().min(1950).max(2200).nullable().optional(), grade: z.coerce.number().min(0).max(100).nullable().optional() }) },
  projects: { model: "project", schema: z.object({ name: z.string().trim().min(1).max(200), description: z.string().trim().max(5000).nullable().optional(), url: z.string().url().max(500).nullable().optional(), repositoryUrl: z.string().url().max(500).nullable().optional(), technologies: z.array(z.string().trim().min(1).max(80)).max(50).optional() }) },
  experience: { model: "experience", schema: z.object({ organization: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(160), description: z.string().trim().max(5000).nullable().optional(), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional() }) },
  certifications: { model: "certification", schema: z.object({ name: z.string().trim().min(1).max(200), issuer: z.string().trim().max(200).nullable().optional(), credentialUrl: z.string().url().max(500).nullable().optional(), issuedAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional() }) },
};
async function profileId(userId) {
  const profile = await getPrisma().studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) { const error = new Error("Student profile was not found."); error.status = 404; throw error; }
  return profile.id;
}
async function recordStudentMutation(req, action, resourceType, resourceId, after = {}) {
  const prisma = getPrisma();
  const studentId = await profileId(req.auth.sub);
  await prisma.$transaction([
    prisma.auditLog.create({ data: { actorUserId: req.auth.sub, createdByUserId: req.auth.sub, action, resourceType, resourceId, after, requestId: req.requestId || `student-${action.toLowerCase()}`, ipAddress: req.ip } }),
    prisma.studentActivity.create({ data: { studentProfileId: studentId, activityType: action, sourceId: resourceId || undefined, metadata: after } }),
  ]);
}
for (const [section, config] of Object.entries(profileSections)) {
  router.get(`/me/${section}`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { res.json({ data: await getPrisma()[config.model].findMany({ where: { studentId: await profileId(req.auth.sub) }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); }
  });
  router.post(`/me/${section}`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { const created = await getPrisma()[config.model].create({ data: { ...config.schema.parse(req.body), studentId: await profileId(req.auth.sub) } }); await recordStudentMutation(req, `STUDENT_${section.toUpperCase()}_CREATED`, section.toUpperCase(), created.id); res.status(201).json({ data: created }); } catch (error) { next(error); }
  });
  router.patch(`/me/${section}/:id`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try {
      const studentId = await profileId(req.auth.sub);
      const existing = await getPrisma()[config.model].findFirst({ where: { id: req.params.id, studentId } });
      if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found." } });
      const updated = await getPrisma()[config.model].update({ where: { id: existing.id }, data: config.schema.parse(req.body) }); await recordStudentMutation(req, `STUDENT_${section.toUpperCase()}_UPDATED`, section.toUpperCase(), existing.id); res.json({ data: updated });
    } catch (error) { next(error); }
  });
  router.delete(`/me/${section}/:id`, authenticate, requireRole("STUDENT"), async (req, res, next) => {
    try { const deleted = await getPrisma()[config.model].deleteMany({ where: { id: req.params.id, studentId: await profileId(req.auth.sub) } }); if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found." } }); await recordStudentMutation(req, `STUDENT_${section.toUpperCase()}_DELETED`, section.toUpperCase(), req.params.id); res.status(204).send(); } catch (error) { next(error); }
  });
}
router.get("/me/skills", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { res.json({ data: await getPrisma().studentSkill.findMany({ where: { studentId: await profileId(req.auth.sub) }, include: { skill: true }, orderBy: { createdAt: "desc" } }) }); } catch (error) { next(error); }
});
router.post("/me/skills", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().max(80).nullable().optional(), evidenceType: z.enum(["SELF_DECLARED", "PROJECT", "CERTIFICATION"]).default("SELF_DECLARED"), proficiency: z.number().min(0).max(100).nullable().optional() }).parse(req.body);
    const prisma = getPrisma(); const studentId = await profileId(req.auth.sub);
    const skill = await prisma.skill.upsert({ where: { name: input.name }, update: { category: input.category }, create: { name: input.name, category: input.category } });
    const data = await prisma.studentSkill.create({ data: { studentId, skillId: skill.id, evidenceType: input.evidenceType, proficiency: input.proficiency }, include: { skill: true } });
    await recordStudentMutation(req, "STUDENT_SKILL_ADDED", "STUDENT_SKILL", data.id, { skill: data.skill.name });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
router.delete("/me/skills/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const deleted = await getPrisma().studentSkill.deleteMany({ where: { id: req.params.id, studentId: await profileId(req.auth.sub) } }); if (!deleted.count) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Skill not found." } }); await recordStudentMutation(req, "STUDENT_SKILL_REMOVED", "STUDENT_SKILL", req.params.id); res.status(204).send(); } catch (error) { next(error); }
});
router.get("/me/resumes", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const profile = await getPrisma().studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    const resumes = await getPrisma().resume.findMany({ where: { studentId: profile.id, deletedAt: null }, include: { activeVersion: { include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, scanStatus: true } } } }, versions: { include: { file: { select: { id: true, originalName: true, mimeType: true, scanStatus: true, sizeBytes: true } } }, orderBy: { version: "desc" } } }, orderBy: { updatedAt: "desc" } });
    res.json({ data: resumes });
  } catch (error) { next(error); }
});
router.post("/me/resumes", authenticate, requireRole("STUDENT"), upload.single("file"), async (req, res, next) => {
  try {
    if (!validResumePayload(req.file)) return res.status(400).json({ error: { code: "INVALID_FILE", message: "Upload a valid PDF or DOCX resume up to 5 MB." } });
    const title = z.string().trim().min(1).max(200).parse(req.body.title || req.file.originalname);
    const prisma = getPrisma();
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.auth.sub }, select: { id: true } });
    if (!profile) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Student profile was not found." } });
    const fileId = crypto.randomUUID();
    const objectKey = `resumes/${req.auth.sub}/${fileId}-${path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storedObject = await storage.put(objectKey, req.file.buffer);
    const sha256 = storedObject.sha256;
    const resume = await prisma.$transaction(async (tx) => {
      const current = await tx.resume.findFirst({ where: { studentId: profile.id, deletedAt: null }, orderBy: { updatedAt: "desc" } });
      const target = current || await tx.resume.create({ data: { studentId: profile.id, title, visibility: "PRIVATE" } });
      const latest = await tx.resumeVersion.findFirst({ where: { resumeId: target.id }, orderBy: { version: "desc" }, select: { version: true } });
      const stored = await tx.storedFile.create({ data: { id: fileId, ownerUserId: req.auth.sub, objectKey, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, sha256, retentionClass: "RESUME", scanStatus: "PENDING" } });
      const version = await tx.resumeVersion.create({ data: { resumeId: target.id, fileId: stored.id, version: (latest?.version || 0) + 1, createdByUserId: req.auth.sub } });
      await tx.resumeProcessingJob.create({ data: { resumeVersionId: version.id, status: "PENDING" } });
      return tx.resume.update({ where: { id: target.id }, data: { title, activeVersionId: version.id }, include: { activeVersion: { include: { file: true } } } });
    });
    await enqueueResumeProcessing(resume.activeVersionId);
    await recordStudentMutation(req, "STUDENT_RESUME_UPLOADED", "RESUME", resume.id, { versionId: resume.activeVersionId });
    res.status(201).json({ data: resume });
  } catch (error) { next(error); }
});
router.patch("/me/resumes/:id/active", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const version = await getPrisma().resumeVersion.findFirst({ where: { id: req.params.id, resume: { studentId: await profileId(req.auth.sub), deletedAt: null }, file: { scanStatus: "CLEAN", deletedAt: null } } }); if (!version) return res.status(404).json({ error: { code: "VERSION_NOT_AVAILABLE", message: "Resume version is unavailable or has not passed scanning." } }); res.json({ data: await getPrisma().resume.update({ where: { id: version.resumeId }, data: { activeVersionId: version.id } }) }); } catch (error) { next(error); }
});
router.delete("/me/resumes/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const resume = await getPrisma().resume.findFirst({ where: { id: req.params.id, studentId: await profileId(req.auth.sub), deletedAt: null }, include: { versions: { include: { file: true } } } }); if (!resume) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resume not found." } }); await getPrisma().resume.update({ where: { id: resume.id }, data: { deletedAt: new Date(), activeVersionId: null } }); await Promise.all(resume.versions.map((version) => storage.remove(version.file.objectKey))); await getPrisma().storedFile.updateMany({ where: { id: { in: resume.versions.map((version) => version.fileId) } }, data: { deletedAt: new Date(), scanStatus: "DELETED" } }); await recordStudentMutation(req, "STUDENT_RESUME_DELETED", "RESUME", resume.id); res.status(204).send(); } catch (error) { next(error); }
});
router.get("/me/resume-versions/:id/download", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try { const version = await getPrisma().resumeVersion.findFirst({ where: { id: req.params.id, resume: { studentId: await profileId(req.auth.sub), deletedAt: null }, file: { scanStatus: "CLEAN", deletedAt: null } }, include: { file: true } }); if (!version) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resume file is unavailable." } }); const buffer = await storage.get(version.file.objectKey); const preview = req.query.preview === "true" && version.file.mimeType === "application/pdf"; const disposition = preview ? "inline" : "attachment"; res.set({ "Content-Type": version.file.mimeType, "Content-Disposition": `${disposition}; filename="${version.file.originalName.replace(/["\r\n]/g, "")}"`, "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" }).send(buffer); } catch (error) { next(error); }
});
router.post("/me/resume-analyses", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const input = resumeAnalysisInputSchema.parse(req.body);
    if (!input.targetRole && !input.jobDescription) {
      return res.status(400).json({ error: { code: "TARGET_REQUIRED", message: "Provide a target role or job description." } });
    }
    const prisma = getPrisma();
    const version = await prisma.resumeVersion.findFirst({ where: { id: input.resumeVersionId, resume: { studentId: await profileId(req.auth.sub), deletedAt: null }, file: { scanStatus: { in: ["CLEAN", "PENDING"] }, deletedAt: null } } });
    if (!version) return res.status(404).json({ error: { code: "VERSION_NOT_FOUND", message: "Resume version is unavailable." } });
    const analysis = await prisma.$transaction(async (tx) => {
      const created = await tx.resumeAnalysis.create({ data: { resumeVersionId: version.id, targetRole: input.targetRole || "General role", jobDescription: input.jobDescription || null, status: "PENDING", findings: {} } });
      await tx.resumeAnalysisJob.create({ data: { analysisId: created.id, status: "PENDING" } });
      return created;
    });
    const queueResult = await enqueueResumeAnalysis(analysis.id);
    if (!queueResult.queued && process.env.NODE_ENV !== "test") setImmediate(() => processResumeAnalysis(analysis.id).catch((error) => console.error("Resume analysis processing failed", error)));
    res.status(202).json({ data: { ...analysis, processing: queueResult } });
  } catch (error) { next(error); }
});
router.get("/me/resume-analyses", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const analyses = await getPrisma().resumeAnalysis.findMany({ where: { resumeVersion: { resume: { studentId: await profileId(req.auth.sub), deletedAt: null } } }, include: { resumeVersion: { select: { id: true, version: true, resume: { select: { id: true, title: true } } } }, processingJob: true }, orderBy: { createdAt: "desc" } });
    res.json({ data: analyses });
  } catch (error) { next(error); }
});
router.get("/me/resume-analyses/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const analysis = await getPrisma().resumeAnalysis.findFirst({ where: { id: req.params.id, resumeVersion: { resume: { studentId: await profileId(req.auth.sub), deletedAt: null } } }, include: { suggestions: true, processingJob: true, resumeVersion: { select: { id: true, version: true, resume: { select: { id: true, title: true } } } } } });
    if (!analysis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Analysis not found." } });
    res.json({ data: analysis });
  } catch (error) { next(error); }
});
router.post("/me/resume-analyses/:id/retry", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const analysis = await getPrisma().resumeAnalysis.findFirst({ where: { id: req.params.id, resumeVersion: { resume: { studentId: await profileId(req.auth.sub) } } } });
    if (!analysis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Analysis not found." } });
    await getPrisma().resumeAnalysis.update({ where: { id: analysis.id }, data: { status: "PENDING", findings: {} } });
    const queued = await enqueueResumeAnalysis(analysis.id);
    if (!queued.queued && process.env.NODE_ENV !== "test") setImmediate(() => processResumeAnalysis(analysis.id).catch((error) => console.error("Resume analysis retry failed", error)));
    res.status(202).json({ data: { id: analysis.id, status: "PENDING", processing: queued } });
  } catch (error) { next(error); }
});
router.patch("/me/profile-suggestions/:id", authenticate, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(["APPROVED", "REJECTED", "PROPOSED"]), suggestedValue: z.string().max(5000).optional() }).parse(req.body);
    const suggestion = await getPrisma().profileSuggestion.findFirst({ where: { id: req.params.id, studentId: await profileId(req.auth.sub) } });
    if (!suggestion) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Suggestion not found." } });
    const updated = await getPrisma().profileSuggestion.update({ where: { id: suggestion.id }, data: { status: input.status, suggestedValue: input.suggestedValue === undefined ? undefined : input.suggestedValue, approvedAt: input.status === "APPROVED" ? new Date() : null } });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.get("/coding/sheets", authenticate, requireRole("STUDENT"), coding.listSheets);
router.put("/coding/sheets/problems/:id/progress", authenticate, requireRole("STUDENT"), coding.updateSheetProgress);
router.get("/coding/topics", authenticate, requireRole("STUDENT"), coding.listTopics);
router.get("/coding/problems", authenticate, requireRole("STUDENT"), coding.listProblems);
router.get("/coding/problems/:id", authenticate, requireRole("STUDENT"), coding.getProblem);
router.get("/coding/problems/:id/starter-code", authenticate, requireRole("STUDENT"), coding.starterCode);
router.post("/coding/runs", authenticate, requireRole("STUDENT"), coding.createRun);
router.get("/coding/runs/:id", authenticate, requireRole("STUDENT"), coding.getRun);
router.post("/coding/submissions", authenticate, requireRole("STUDENT"), coding.createSubmission);
router.get("/coding/submissions", authenticate, requireRole("STUDENT"), coding.history);
router.get("/coding/submissions/:id", authenticate, requireRole("STUDENT"), coding.getSubmission);
router.get("/coding/stats", authenticate, requireRole("STUDENT"), coding.stats);
router.use("/coding/library", authenticate, requireRole("STUDENT"), codingLibrary.studentRouter);
router.use("/admin/coding-library", authenticate, requireRole("ADMIN"), codingLibraryAdmin.router);
router.get("/admin/ai/health", authenticate, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const data = llm.healthInfo();
    if (String(req.query.probe) === "1") {
      try {
        await llm.generateText({
          system: "Respond with only OK.",
          messages: [{ role: "user", content: "Reply OK." }],
          maxTokens: 8,
        });
        data.probe = "ok";
      } catch (error) {
        data.probe = "unavailable";
        data.errorCode = error.code || "LLM_UNAVAILABLE";
      }
    }
    res.json({ data });
  } catch (error) { next(error); }
});

router.use("/me/interviews", authenticate, requireRole("STUDENT"), interview);
router.use("/me/notifications", authenticate, notifications.router);
router.use("/me", authenticate, requireRole("STUDENT"), performance);
router.use("/admin", authenticate, requireRole("ADMIN"), admin);
router.use("/recruiter", authenticate, requireRole("RECRUITER"), recruiter);
router.use("/recruiter/interviews", authenticate, requireRole("RECRUITER"), recruiterInterviews);
router.use("/interviews", authenticate, requireRole("STUDENT", "RECRUITER"), recruiterInterviews);
router.use("/recruiter-interviews", authenticate, requireRole("STUDENT", "RECRUITER"), liveInterviews);
router.use("/interviews", authenticate, requireRole("STUDENT", "RECRUITER"), liveInterviews);
router.use("/jobs", authenticate, requireRole("STUDENT"), jobs);
router.use("/subjects", authenticate, subjects.adminRouter, subjects.studentRouter);
router.post("/subjects/:subjectSlug/topics/:topicSlug/progress", requireRole("STUDENT"), subjects.updateTopicProgress);
router.use("/target-roles", authenticate, requireRole("STUDENT"), targetRoles.studentRouter);
router.use("/admin/target-roles", authenticate, requireRole("ADMIN"), targetRoles.adminRouter);
router.use("/dsa-sheets", authenticate, requireRole("STUDENT"), dsaSheets.studentRouter);
router.use("/admin/dsa-sheets", authenticate, requireRole("ADMIN"), dsaSheets.adminRouter);

module.exports = router;
