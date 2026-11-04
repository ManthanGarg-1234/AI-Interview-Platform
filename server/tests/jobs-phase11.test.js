"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const jobs = require("../jobs");
const recruiter = require("../recruiter");

test("resume access requires the authenticated student's ownership and a clean active file", async () => {
  const resume = { activeVersion: { file: { scanStatus: "CLEAN", deletedAt: null } } };
  const prisma = {
    studentProfile: { findUnique: async ({ where }) => ({ id: where.userId === "student-a" ? "profile-a" : "profile-b" }) },
    resume: { findFirst: async ({ where }) => where.studentId === "profile-a" && where.id === "resume-a" ? resume : null },
  };
  assert.equal((await jobs.findAccessibleResume(prisma, "resume-a", "student-a")) !== null, true);
  assert.equal(await jobs.findAccessibleResume(prisma, "resume-a", "student-b"), null);
  assert.equal(await jobs.findAccessibleResume(prisma, "resume-missing", "student-a"), null);
  prisma.resume.findFirst = async () => ({ activeVersion: { file: { scanStatus: "PENDING", deletedAt: null } } });
  assert.equal(await jobs.findAccessibleResume(prisma, "resume-a", "student-a"), null);
});

test("recruiter company access rejects cross-company and inactive memberships", () => {
  const access = { companyId: "company-a", active: true, role: "HIRING_MANAGER" };
  assert.equal(recruiter.isAuthorizedCompanyMember(access, "company-a"), true);
  assert.equal(recruiter.isAuthorizedCompanyMember(access, "company-b"), false);
  assert.equal(recruiter.isAuthorizedCompanyMember({ ...access, active: false }, "company-a"), false);
});
