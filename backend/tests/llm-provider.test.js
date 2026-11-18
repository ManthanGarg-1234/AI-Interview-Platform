"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { generateText, generateJson, resetCircuitState } = require("../llm/provider");

async function withEnvAndFetch(fn) {
  const previous = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
    LLM_API_URL: process.env.LLM_API_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
    LLM_MAX_RETRIES: process.env.LLM_MAX_RETRIES,
  };
  const previousFetch = global.fetch;
  resetCircuitState();
  try {
    await fn();
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Gemini REST success maps system and sends the key only as a header", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.LLM_MAX_RETRIES = "0";
    global.fetch = async (url, options) => {
      assert.equal(url.includes("test-gemini-key"), false);
      assert.equal(options.headers["x-goog-api-key"], "test-gemini-key");
      const body = JSON.parse(options.body);
      assert.equal(body.systemInstruction.parts[0].text, "System text");
      assert.equal(body.contents[0].role, "user");
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] }) };
    };
    const result = await generateText({ system: "System text", messages: [{ role: "user", content: "Hi" }] });
    assert.equal(result.text, "Hello");
  });
});

test("invalid Gemini JSON is retried once and validated", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.LLM_MAX_RETRIES = "0";
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      const text = calls === 1 ? "not-json" : '{"answer":"yes"}';
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
    };
    const result = await generateJson(z.object({ answer: z.string() }), { messages: [{ role: "user", content: "Answer" }] });
    assert.equal(result.output.answer, "yes");
    assert.equal(calls, 2);
  });
});

test("Gemini timeout returns a typed unavailable error", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LLM_MAX_RETRIES = "0";
    global.fetch = async (_url, options) => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    await assert.rejects(() => generateText({ messages: [{ role: "user", content: "Hi" }], timeoutMs: 10 }), (error) => error.code === "LLM_UNAVAILABLE");
  });
});

test("429 responses retry once", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.LLM_MAX_RETRIES = "1";
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429 };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Recovered" }] } }] }) };
    };
    const result = await generateText({ messages: [{ role: "user", content: "Hi" }] });
    assert.equal(result.text, "Recovered");
    assert.equal(calls, 2);
  });
});

test("missing Gemini key is typed and does not call fetch", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    global.fetch = async () => assert.fail("fetch must not be called");
    await assert.rejects(() => generateText({ messages: [{ role: "user", content: "Hi" }] }), (error) => error.code === "LLM_NOT_CONFIGURED");
  });
});

test("Gemini safety blocks return a typed unavailable error", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    process.env.LLM_MAX_RETRIES = "0";
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) });
    await assert.rejects(() => generateText({ messages: [{ role: "user", content: "Hi" }] }), (error) => error.code === "LLM_UNAVAILABLE");
  });
});

test("Gemini 503 retries and succeeds", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "primary-model";
    delete process.env.GEMINI_FALLBACK_MODEL;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: { message: "temporarily overloaded" } }) };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Recovered" }] } }] }) };
    };
    const result = await generateText({ messages: [{ role: "user", content: "Hi" }] });
    assert.equal(result.text, "Recovered");
    assert.equal(calls, 2);
  });
});

test("Gemini 503 retries then uses fallback model", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "primary-model";
    process.env.GEMINI_FALLBACK_MODEL = "fallback-model";
    let calls = 0;
    let fallbackCalled = false;
    global.fetch = async (url) => {
      calls += 1;
      if (url.includes("primary-model")) return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: { message: "temporarily overloaded" } }) };
      fallbackCalled = true;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Fallback answer" }] } }] }) };
    };
    const result = await generateText({ messages: [{ role: "user", content: "Hi" }], timeoutMs: 5000 });
    assert.equal(result.text, "Fallback answer");
    assert.equal(result.modelAlias, "fallback-model");
    assert.equal(fallbackCalled, true);
  });
});

test("Gemini 404 on primary tries fallback model once", async () => {
  await withEnvAndFetch(async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "retired-model";
    process.env.GEMINI_FALLBACK_MODEL = "fallback-model";
    let calls = 0;
    global.fetch = async (url) => {
      calls += 1;
      if (url.includes("retired-model")) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: { message: "model not found" } }) };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Fallback answer" }] } }] }) };
    };
    const result = await generateText({ messages: [{ role: "user", content: "Hi" }], timeoutMs: 5000 });
    assert.equal(result.text, "Fallback answer");
    assert.equal(calls, 2);
  });
});
