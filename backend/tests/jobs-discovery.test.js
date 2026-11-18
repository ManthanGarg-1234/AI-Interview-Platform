"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const prismaModule = require("../prisma");

let prisma;
prismaModule.getPrisma = () => prisma;
const jobs = require("../jobs");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use("/jobs", (req, _res, next) => { req.auth = { sub: "student-1" }; next(); }, jobs);
  app.use((error, _req, res) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("job discovery applies filters and exposes only the current student's saved state", async () => {
  let query;
  prisma = {
    job: {
      findMany: async (args) => {
        query = args;
        return [{
          id: "job-1",
          title: "Frontend Engineer",
          company: { name: "Example Co" },
          skills: [],
          bookmarks: [{ id: "bookmark-1" }],
        }];
      },
      count: async () => 1,
    },
  };
  const response = await fetch(`${origin}/jobs?q=Engineer&location=Remote&employmentType=INTERNSHIP&page=2&limit=5`);
  assert.equal(response.status, 200);
  assert.deepEqual(query.where, {
    status: "PUBLISHED",
    OR: [
      { title: { contains: "Engineer", mode: "insensitive" } },
      { description: { contains: "Engineer", mode: "insensitive" } },
      { company: { name: { contains: "Engineer", mode: "insensitive" } } },
    ],
    location: { contains: "Remote", mode: "insensitive" },
    employmentType: "INTERNSHIP",
  });
  assert.deepEqual(query.include.bookmarks, { where: { userId: "student-1" }, select: { id: true } });
  const body = await response.json();
  assert.equal(body.data.items[0].bookmarked, true);
  assert.equal(body.data.page, 2);
  assert.equal(body.data.limit, 5);
});
