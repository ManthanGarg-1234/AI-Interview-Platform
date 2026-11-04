"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const assessment = require("../assessment");

test("assessment scoring applies exact answers, partial multiple-choice credit, and negative marking", () => {
  assert.deepEqual(assessment.scoreAnswer({ type: "SINGLE_CORRECT", answerKey: "b" }, "b", 2, 0.5), { correct: true, points: 2 });
  const partial = assessment.scoreAnswer({ type: "MULTIPLE_CORRECT", answerKey: ["a", "b"] }, ["a"], 4, 0.5);
  assert.equal(partial.correct, false);
  assert.equal(partial.points, 1.5);
  assert.deepEqual(assessment.scoreAnswer({ type: "TRUE_FALSE", answerKey: true }, false, 1, 0.25), { correct: false, points: -0.25 });
});

test("answer normalization makes option ordering deterministic", () => {
  assert.deepEqual(assessment.normalizeAnswer(["b", "a"]), ["a", "b"]);
  assert.equal(assessment.normalizeAnswer(" Answer "), "answer");
});
