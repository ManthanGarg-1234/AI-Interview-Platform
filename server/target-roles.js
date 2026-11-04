"use strict";

const express = require("express");
const { z } = require("zod");
const { getPrisma } = require("./prisma");

const studentRouter = express.Router();
const adminRouter = express.Router();

const roleFields = {
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(5000).nullable().optional(),
  requiredSkills: z.array(z.string().trim().min(1).max(120)).max(100),
  dsaRequirements: z.record(z.string(), z.unknown()),
  coreSubjects: z.array(z.string().trim().min(1).max(120)).max(50),
  languages: z.array(z.string().trim().min(1).max(80)).max(50),
  status: z.enum(["PUBLISHED", "DRAFT"]),
};

const selectionSchema = z.object({
  roleSlug: z.string().trim().min(2).max(200),
  isPrimary: z.boolean().optional(),
  goalDate: z.coerce.date().nullable().optional(),
});

async function setPrimary(tx, userId, roleId, goalDate) {
  await tx.studentTargetRole.updateMany({ where: { userId }, data: { isPrimary: false } });
  return tx.studentTargetRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: { isPrimary: true, ...(goalDate !== undefined ? { goalDate } : {}) },
    create: { userId, roleId, isPrimary: true, goalDate: goalDate || null },
    include: { role: true },
  });
}

studentRouter.get("/", async (_req, res, next) => {
  try {
    const roles = await getPrisma().targetRole.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
    });
    res.json({ data: roles });
  } catch (error) { next(error); }
});

studentRouter.get("/mine", async (req, res, next) => {
  try {
    const selections = await getPrisma().studentTargetRole.findMany({
      where: { userId: req.auth.sub, role: { status: "PUBLISHED" } },
      include: { role: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    res.json({ data: selections });
  } catch (error) { next(error); }
});

studentRouter.post("/mine", async (req, res, next) => {
  try {
    const input = selectionSchema.parse(req.body);
    const prisma = getPrisma();
    const role = await prisma.targetRole.findFirst({ where: { slug: input.roleSlug, status: "PUBLISHED" }, select: { id: true } });
    if (!role) return res.status(404).json({ error: { code: "ROLE_NOT_FOUND", message: "Target role was not found." } });

    const userId = req.auth.sub;
    const shouldBePrimary = input.isPrimary === true || await prisma.studentTargetRole.count({ where: { userId } }) === 0;
    const selection = await prisma.$transaction(async (tx) => {
      if (shouldBePrimary) return setPrimary(tx, userId, role.id, input.goalDate);
      return tx.studentTargetRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: { ...(input.goalDate !== undefined ? { goalDate: input.goalDate } : {}) },
        create: { userId, roleId: role.id, isPrimary: false, goalDate: input.goalDate || null },
        include: { role: true },
      });
    });
    res.status(201).json({ data: selection });
  } catch (error) { next(error); }
});

studentRouter.patch("/mine/:slug", async (req, res, next) => {
  try {
    const input = z.object({ isPrimary: z.boolean().optional(), goalDate: z.coerce.date().nullable().optional() }).refine((value) => Object.keys(value).length > 0).parse(req.body);
    const prisma = getPrisma();
    const userId = req.auth.sub;
    const selection = await prisma.studentTargetRole.findFirst({
      where: { userId, role: { slug: req.params.slug, status: "PUBLISHED" } },
      include: { role: true },
    });
    if (!selection) return res.status(404).json({ error: { code: "ROLE_NOT_SELECTED", message: "That target role is not selected." } });

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) return setPrimary(tx, userId, selection.roleId, input.goalDate);
      if (input.isPrimary === false) {
        await tx.studentTargetRole.updateMany({ where: { userId, roleId: selection.roleId }, data: { isPrimary: false } });
      }
      return tx.studentTargetRole.update({
        where: { userId_roleId: { userId, roleId: selection.roleId } },
        data: input.goalDate !== undefined ? { goalDate: input.goalDate } : {},
        include: { role: true },
      });
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});

studentRouter.delete("/mine/:slug", async (req, res, next) => {
  try {
    const removed = await getPrisma().studentTargetRole.deleteMany({
      where: { userId: req.auth.sub, role: { slug: req.params.slug } },
    });
    if (!removed.count) return res.status(404).json({ error: { code: "ROLE_NOT_SELECTED", message: "That target role is not selected." } });
    res.status(204).send();
  } catch (error) { next(error); }
});

adminRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ data: await getPrisma().targetRole.findMany({ orderBy: { name: "asc" } }) });
  } catch (error) { next(error); }
});

adminRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      ...roleFields,
      requiredSkills: roleFields.requiredSkills.default([]),
      dsaRequirements: roleFields.dsaRequirements.default({}),
      coreSubjects: roleFields.coreSubjects.default([]),
      languages: roleFields.languages.default([]),
      status: roleFields.status.default("PUBLISHED"),
    }).parse(req.body);
    const role = await getPrisma().targetRole.create({ data: input });
    res.status(201).json({ data: role });
  } catch (error) { next(error); }
});

adminRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = z.object(roleFields).partial().refine((value) => Object.keys(value).length > 0).parse(req.body);
    const result = await getPrisma().targetRole.updateMany({ where: { id: req.params.id }, data: input });
    if (!result.count) return res.status(404).json({ error: { code: "ROLE_NOT_FOUND", message: "Target role was not found." } });
    res.json({ data: await getPrisma().targetRole.findUnique({ where: { id: req.params.id } }) });
  } catch (error) { next(error); }
});

module.exports = { studentRouter, adminRouter };
