"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const app = require("../index");
const { router, contestPhase, assertWindow, scoreFor } = require("../contests");

test("contest time windows are evaluated on the server clock", () => {
  const contest = {
    startsAt: new Date("2026-01-01T10:00:00Z"),
    endsAt: new Date("2026-01-01T12:00:00Z"),
  };
  assert.equal(
    contestPhase(contest, new Date("2026-01-01T09:59:59Z")),
    "UPCOMING",
  );
  assert.equal(contestPhase(contest, new Date("2026-01-01T11:00:00Z")), "LIVE");
  assert.equal(
    contestPhase(contest, new Date("2026-01-01T12:00:00Z")),
    "ENDED",
  );
  assert.throws(
    () =>
      assertWindow(
        { ...contest, status: "PUBLISHED" },
        new Date("2026-01-01T09:00:00Z"),
      ),
    (error) => error.code === "CONTEST_NOT_STARTED",
  );
  assert.throws(
    () =>
      assertWindow(
        { ...contest, status: "PUBLISHED" },
        new Date("2026-01-01T13:00:00Z"),
      ),
    (error) => error.code === "CONTEST_ENDED",
  );
});

test("contest scoring applies wrong-answer penalties and never goes negative", () => {
  assert.equal(scoreFor({ points: 100, penaltyPerWrong: 10 }, 2), 80);
  assert.equal(scoreFor({ points: 20, penaltyPerWrong: 50 }, 1), 0);
});

test("contest submissions reject non-Java languages before database access", async () => {
  const contestApp = express();
  contestApp.use(express.json());
  contestApp.use((req, _res, next) => {
    req.auth = { sub: "student-1" };
    next();
  });
  contestApp.use("/contests", router);
  contestApp.use((error, _req, res, _next) =>
    res
      .status(error.status || 400)
      .json({ error: { code: error.code || "INVALID_REQUEST" } }),
  );
  const server = contestApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/contests/contest-1/submissions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contestProblemId: "29ca3668-65b3-490e-b0ae-37d4ff6c3437",
          language: "Python",
          sourceCode: "print(1)",
        }),
      },
    );
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("contest endpoints remain protected by authentication", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of [
      "/api/v1/contests",
      "/api/v1/contests/example/register",
      "/api/v1/admin/contests",
    ]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 401, path);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
