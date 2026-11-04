"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { canSchedule, assertTransition, validWindow } = require("../recruiter-interviews");

test("recruiter interview authorization is company-member and role scoped", () => {
  assert.equal(canSchedule({ active: true, role: "HIRING_MANAGER" }), true);
  assert.equal(canSchedule({ active: true, role: "INTERVIEWER" }), false);
  assert.equal(canSchedule({ active: false, role: "OWNER" }), false);
});

test("interview lifecycle rejects terminal state changes", () => {
  assert.doesNotThrow(() => assertTransition("SCHEDULED", "CONFIRMED"));
  assert.throws(() => assertTransition("COMPLETED", "CANCELLED"), /Cannot transition/);
});

test("timezone-aware schedule windows require a positive bounded duration", () => {
  assert.doesNotThrow(() => validWindow(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")));
  assert.throws(() => validWindow(new Date("2026-01-01T11:00:00Z"), new Date("2026-01-01T10:00:00Z")));
  assert.throws(() => validWindow(new Date("2026-01-01T10:00:00Z"), new Date("2026-01-02T11:00:00Z")));
});
