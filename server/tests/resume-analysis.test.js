"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analysisOutputSchema, scoreResume, providerAnalyze } = require("../resume-analysis");

test("ATS estimate is transparent, bounded, and extracts missing keywords", () => {
  const result = scoreResume({ text: "Frontend developer with React and JavaScript. Education: BSc. Project: portfolio.", targetRole: "Frontend Engineer", jobDescription: "React TypeScript accessibility testing" });
  assert.equal(result.categories.skillsRelevance >= 0 && result.categories.skillsRelevance <= 100, true);
  assert.equal(result.categories.keywordAlignment >= 0 && result.categories.keywordAlignment <= 100, true);
  assert.equal(result.missingKeywords.includes("typescript"), true);
  assert.equal(result.suggestions.length > 0, true);
});

test("structured AI output validation rejects invented or malformed shapes", () => {
  assert.throws(() => analysisOutputSchema.parse({ categories: {} }), /Required|expected/i);
});

test("local provider is explicit and produces validated mock analysis", async () => {
  const previousUrl = process.env.LLM_API_URL;
  const previousKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_URL;
  delete process.env.LLM_API_KEY;
  const result = await providerAnalyze({ text: "Education: BSc. Project: API service.", targetRole: "Backend Engineer", jobDescription: "Node PostgreSQL" });
  assert.equal(result.provider, "mock");
  assert.equal(result.modelAlias, "local-resume-analyzer-v1");
  assert.equal(typeof result.output.categories.projectRelevance, "number");
  if (previousUrl === undefined) delete process.env.LLM_API_URL; else process.env.LLM_API_URL = previousUrl;
  if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey;
});
