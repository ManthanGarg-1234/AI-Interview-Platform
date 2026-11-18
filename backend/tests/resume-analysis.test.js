"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analysisOutputSchema, resumeAnalysisInputSchema, ATS_WEIGHTS, scoreResume, providerAnalyze, redactPII } = require("../resume-analysis");

test("resume analysis input accepts null, empty, or missing target fields", () => {
  const resumeVersionId = "550e8400-e29b-41d4-a716-446655440000";
  assert.doesNotThrow(() => resumeAnalysisInputSchema.parse({ resumeVersionId, targetRole: null, jobDescription: "" }));
  assert.doesNotThrow(() => resumeAnalysisInputSchema.parse({ resumeVersionId, jobDescription: "TypeScript Node.js" }));
  assert.equal(resumeAnalysisInputSchema.parse({ resumeVersionId, targetRole: "", jobDescription: null }).targetRole, undefined);
});

test("ATS estimate is transparent, bounded, and extracts missing keywords", () => {
  const result = scoreResume({ text: "Frontend developer with React and JavaScript. Education: BSc. Project: portfolio.", targetRole: "Frontend Engineer", jobDescription: "React TypeScript accessibility testing" });
  assert.equal(result.categories.skillsKeywordQuality >= 0 && result.categories.skillsKeywordQuality <= ATS_WEIGHTS.skillsKeywordQuality, true);
  assert.equal(result.total >= 0 && result.total <= 100, true);
  assert.equal(result.missingKeywords.includes("typescript"), true);
  assert.equal(result.issues.length > 0, true);
});

test("structured AI output validation rejects invented or malformed shapes", () => {
  assert.throws(() => analysisOutputSchema.parse({ categories: {} }), /Required|expected/i);
});

test("local provider is explicit and produces validated mock analysis", async () => {
  const previousUrl = process.env.LLM_API_URL;
  const previousKey = process.env.LLM_API_KEY;
  const previousProvider = process.env.LLM_PROVIDER;
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.LLM_API_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.LLM_PROVIDER = "none";
  const result = await providerAnalyze({ text: "Education: BSc. Project: API service.", targetRole: "Backend Engineer", jobDescription: "Node PostgreSQL" });
  assert.equal(result.provider, "mock");
  assert.equal(result.modelAlias, "local-resume-analyzer-v1");
  assert.equal(typeof result.output.categories.contentStrength, "number");
  if (previousUrl === undefined) delete process.env.LLM_API_URL; else process.env.LLM_API_URL = previousUrl;
  if (previousKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousKey;
  if (previousProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = previousProvider;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousGeminiKey;
});

test("strong and weak resume fixtures produce bounded deterministic scores", () => {
  const strong = scoreResume({
    text: "John Doe\n123 Main Street\njohn@example.com | 555-123-4567 | linkedin.com/in/john\nExperience\nBuilt JavaScript services and improved latency by 35%.\nEducation\nBSc Computer Science\nSkills\nJavaScript, Node.js, PostgreSQL\n2022-2025",
    targetRole: "JavaScript Engineer",
    jobDescription: "JavaScript Node.js PostgreSQL",
  });
  const weak = scoreResume({ text: "Resume", parseQuality: "empty" });
  assert.ok(strong.total >= 50 && strong.total <= 100);
  assert.ok(weak.total >= 0 && weak.total < 50);
  assert.ok(strong.categories.skillsKeywordQuality > weak.categories.skillsKeywordQuality);
});

test("Java does not falsely match JavaScript", () => {
  const result = scoreResume({ text: "Skills: JavaScript. Experience: Built JavaScript applications.", targetRole: "Java developer", jobDescription: "Java" });
  assert.equal(result.matchedKeywords.includes("java"), false);
  assert.equal(result.missingKeywords.includes("java"), true);
});

test("PII and profile links are redacted before provider use", () => {
  const redacted = redactPII("Name: Taylor Student\nAddress: 123 Main Street\nTaylor@example.com\n555-123-4567\nhttps://github.com/taylor\nlinkedin.com/in/taylor");
  assert.equal(redacted.includes("Taylor@example.com"), false);
  assert.equal(redacted.includes("Taylor Student"), false);
  assert.equal(redacted.includes("123 Main Street"), false);
  assert.equal(redacted.includes("555-123-4567"), false);
  assert.equal(redacted.includes("github.com"), false);
  assert.equal(redacted.includes("REDACTED"), true);
});

test("LLM-down fallback retains deterministic score and adds a notice", async () => {
  const previous = {
    provider: process.env.LLM_PROVIDER,
    key: process.env.GEMINI_API_KEY,
    retries: process.env.LLM_MAX_RETRIES,
  };
  process.env.LLM_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.LLM_MAX_RETRIES = "0";
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });
  try {
    const result = await providerAnalyze({ text: "Education: BSc. Skills: JavaScript. Experience: Built applications.", targetRole: "Engineer", jobDescription: "JavaScript" });
    assert.equal(typeof result.output.total, "number");
    assert.match(result.output.notice, /deterministic/i);
  } finally {
    global.fetch = previousFetch;
    if (previous.provider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.key;
    if (previous.retries === undefined) delete process.env.LLM_MAX_RETRIES; else process.env.LLM_MAX_RETRIES = previous.retries;
  }
});

test("same resume input produces the same deterministic score", () => {
  const input = { text: "Experience: Improved uptime by 20%. Education: BSc. Skills: JavaScript.", targetRole: "Engineer", jobDescription: "JavaScript" };
  assert.deepEqual(scoreResume(input), scoreResume(input));
});

test("Gemini feedback cannot change the deterministic ATS total", async () => {
  const previous = {
    provider: process.env.LLM_PROVIDER,
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    retries: process.env.LLM_MAX_RETRIES,
  };
  const previousFetch = global.fetch;
  process.env.LLM_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  process.env.LLM_MAX_RETRIES = "0";
  const input = { text: "Education: BSc. Experience: Built services. Skills: JavaScript.", targetRole: "Engineer", jobDescription: "JavaScript" };
  const deterministic = scoreResume(input);
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        total: 1,
        categories: { parseability: 1 },
        strengths: ["Feedback only"],
        weaknesses: [],
        missingKeywords: [],
        rewrittenBullets: [],
        prioritizedTips: [],
      }) }] } }],
    }),
  });
  try {
    const result = await providerAnalyze(input);
    assert.equal(result.output.total, deterministic.total);
    assert.deepEqual(result.output.categories, deterministic.categories);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries({
      LLM_PROVIDER: previous.provider,
      GEMINI_API_KEY: previous.key,
      GEMINI_MODEL: previous.model,
      LLM_MAX_RETRIES: previous.retries,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
