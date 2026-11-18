"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const performanceRouter = require("../performance");

async function withMentorEnv(fetchImpl, fn) {
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
  global.fetch = fetchImpl;
  try {
    await fn();
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
}

test("mentor returns a normal mocked provider answer", async () => {
  await withMentorEnv(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(body.systemInstruction);
    assert.equal(body.contents.at(-1).parts[0].text.includes("password"), false);
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"text":"Use a STAR answer and give a measurable result."}' }] } }] }),
    };
  }, async () => {
    const result = await performanceRouter.mentorReply("How should I answer?", { weakestTopic: "practice" }, []);
    assert.match(result.text, /STAR|measurable/i);
  });
});

test("mentor provider-down fallback keeps a friendly response", async () => {
  await withMentorEnv(async () => ({ ok: false, status: 503 }), async () => {
    const result = await performanceRouter.mentorReply("Help with interview prep", { weakestTopic: "practice" }, []);
    assert.match(result.text, /temporarily unavailable|saved|retry/i);
  });
});

test("mentor rejects input longer than 5000 characters", () => {
  assert.throws(() => performanceRouter.mentorMessageSchema.parse({ message: "x".repeat(5001) }), /too_big|String must contain/i);
  assert.doesNotThrow(() => performanceRouter.mentorMessageSchema.parse({ message: "Help me practice." }));
});

test("mentor redacts email, phone, and password data before provider context", () => {
  const redacted = performanceRouter.redactSensitiveMentorInput("Email a@b.com phone 555-123-4567 password=secret");
  assert.equal(redacted.includes("a@b.com"), false);
  assert.equal(redacted.includes("555-123-4567"), false);
  assert.equal(redacted.includes("secret"), false);
  assert.match(redacted, /REDACTED/);
});
