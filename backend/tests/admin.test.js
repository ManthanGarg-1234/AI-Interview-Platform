"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");
const recruiterModule = require("../recruiter");
const notificationsModule = require("../notifications");

let prisma;
prismaModule.getPrisma = () => prisma;
const cacheInvalidations = [];
recruiterModule.invalidateRecruiterCache = async (companyIds) => {
  cacheInvalidations.push(companyIds);
};
notificationsModule.createNotification = async () => {};
const admin = require("../admin");

let server;
let origin;
let currentStatus;
const sessionRows = [{ revokedAt: null }, { revokedAt: null }];
const familyRows = [{ revokedAt: null }, { revokedAt: null }];
const refreshTokenRows = [{ revokedAt: null }, { revokedAt: null }];
const sessionRevocations = [];
const familyRevocations = [];
const refreshTokenRevocations = [];

test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/admin", (req, _res, next) => {
    req.auth = { sub: "admin-user" };
    next();
  }, admin);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise((resolve) => server.close(resolve)));

function installPrisma() {
  currentStatus = "ACTIVE";
  sessionRows.forEach((row) => { row.revokedAt = null; });
  familyRows.forEach((row) => { row.revokedAt = null; });
  refreshTokenRows.forEach((row) => { row.revokedAt = null; });
  sessionRevocations.length = 0;
  familyRevocations.length = 0;
  refreshTokenRevocations.length = 0;
  cacheInvalidations.length = 0;

  const tx = {
    user: {
      update: async ({ data }) => {
        currentStatus = data.status;
        return { id: "recruiter-user", status: currentStatus };
      },
    },
    userSession: {
      updateMany: async ({ data }) => {
        sessionRevocations.push(data);
        sessionRows.forEach((row) => { row.revokedAt = data.revokedAt; });
      },
    },
    tokenFamily: {
      updateMany: async ({ data }) => {
        familyRevocations.push(data);
        familyRows.forEach((row) => { row.revokedAt = data.revokedAt; });
      },
    },
    refreshToken: {
      updateMany: async ({ data }) => {
        refreshTokenRevocations.push(data);
        refreshTokenRows.forEach((row) => { row.revokedAt = data.revokedAt; });
      },
    },
    auditLog: { create: async () => ({}) },
  };
  prisma = {
    user: {
      findUnique: async () => ({ id: "recruiter-user", email: "r@example.test", role: "RECRUITER", status: currentStatus }),
    },
    $transaction: async (callback) => callback(tx),
    companyMember: {
      findMany: async () => [{ companyId: "company-1" }, { companyId: "company-2" }],
    },
  };
}

async function setStatus(status) {
  return fetch(`${origin}/admin/users/recruiter-user/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, reason: "Administrative review" }),
  });
}

test("suspension and deletion revoke sessions and every refresh-token family, then invalidate recruiter cache", async (t) => {
  for (const status of ["SUSPENDED", "DELETED"]) {
    await t.test(status, async () => {
      installPrisma();

      const response = await setStatus(status);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { id: "recruiter-user", status } });
      assert.equal(sessionRevocations.length, 1);
      assert.equal(familyRevocations.length, 1);
      assert.equal(refreshTokenRevocations.length, 1);
      assert.ok(sessionRows.every(({ revokedAt }) => revokedAt instanceof Date));
      assert.ok(familyRows.every(({ revokedAt }) => revokedAt instanceof Date));
      assert.ok(refreshTokenRows.every(({ revokedAt }) => revokedAt instanceof Date));
      assert.equal(sessionRevocations[0].revokeReason, `ADMIN_${status}`);
      assert.deepEqual(cacheInvalidations, [["company-1", "company-2"]]);
    });
  }
});

test("restoring an account does not revive or replace previously revoked sessions", async () => {
  installPrisma();
  assert.equal((await setStatus("SUSPENDED")).status, 200);
  const revokedAt = sessionRows[0].revokedAt;

  assert.equal((await setStatus("ACTIVE")).status, 200);

  assert.equal(currentStatus, "ACTIVE");
  assert.equal(sessionRevocations.length, 1);
  assert.equal(familyRevocations.length, 1);
  assert.equal(refreshTokenRevocations.length, 1);
  assert.ok(sessionRows.every(({ revokedAt: value }) => value === revokedAt));
  assert.ok(familyRows.every(({ revokedAt: value }) => value === revokedAt));
  assert.ok(refreshTokenRows.every(({ revokedAt: value }) => value === revokedAt));
  assert.deepEqual(cacheInvalidations, [["company-1", "company-2"], ["company-1", "company-2"]]);
});
