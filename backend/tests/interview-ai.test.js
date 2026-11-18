"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generatedQuestionSchema, evaluationSchema, generateQuestion, evaluateAnswer } = require("../interview-ai");

test("local interviewer generates a labelled question and bounded evaluation", async () => {
  const previousUrl = process.env.LLM_API_URL;
  const previousKey = process.env.LLM_API_KEY;
  const previousProvider = process.env.LLM_PROVIDER;
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.LLM_API_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.LLM_PROVIDER = "none";
  const configuration = { targetRole: "Backend Engineer", experienceLevel: "INTERMEDIATE", type: "TECHNICAL", difficulty: "MEDIUM", topics: ["SQL"], questionCount: 3 };
  const question = await generateQuestion({ configuration, sequence: 1, resumeText: "" });
  const evaluation = await evaluateAnswer({ configuration, answer: "I would use an indexed query and explain the trade-offs before measuring it." });
  assert.equal(question.provider, "mock");
  assert.equal(question.modelAlias, "local-interviewer-v1");
  assert.doesNotThrow(() => generatedQuestionSchema.parse(question.question));
  assert.doesNotThrow(() => evaluationSchema.parse(evaluation.evaluation));
  assert.ok(evaluation.evaluation.overallScore >= 0 && evaluation.evaluation.overallScore <= 100);
  if (previousUrl === undefined) delete process.env.LLM_API_URL; else process.env.LLM_API_URL = previousUrl;
  if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey;
  if (previousProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = previousProvider;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousGeminiKey;
});

test("malformed generated output is rejected by the schema", () => {
  assert.throws(() => generatedQuestionSchema.parse({ text: "too short" }), /too_small|String must contain/i);
});
