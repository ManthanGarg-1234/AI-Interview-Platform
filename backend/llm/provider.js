"use strict";

const crypto = require("node:crypto");

const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60_000;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let overloadFailureCount = 0;

function safeReason(value) {
  if (!value) return "unknown";
  return String(value).replace(/[\r\n]+/g, " ").replace(/AIza[A-Za-z0-9_-]+/g, "[REDACTED_KEY]").slice(0, 300);
}

function logProviderFailure(config, error) {
  const reason = safeReason(error.reason || error.message);
  console.error(JSON.stringify({
    event: "LLM_FAILURE",
    provider: config?.provider || process.env.LLM_PROVIDER || "unknown",
    model: config?.provider === "gemini"
      ? config.geminiModel
      : config?.provider === "openai-compatible"
        ? config.openAiModel
        : process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    httpStatus: Number.isInteger(error.status) ? error.status : null,
    reason,
  }));
}

function typedError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function providerConfig() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.LLM_API_KEY;
  const openAiUrl = process.env.LLM_API_URL;
  let provider = process.env.LLM_PROVIDER;
  if (!provider) {
    if (geminiKey) provider = "gemini";
    else if (openAiUrl && openAiKey) provider = "openai-compatible";
    else provider = "none";
  }
  return {
    provider,
    geminiKey,
    geminiModel: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || null,
    openAiKey,
    openAiUrl,
    openAiModel: process.env.LLM_MODEL || "configured-model",
  };
}

function healthInfo() {
  const config = providerConfig();
  const circuit = {
    open: Date.now() < circuitOpenUntil,
    consecutiveFailures,
    overloadFailureCount,
  };
  if (config.provider === "gemini") {
    return { provider: "gemini", model: config.geminiModel, configured: Boolean(config.geminiKey), circuit };
  }
  if (config.provider === "openai-compatible") {
    return { provider: "openai-compatible", model: config.openAiModel, configured: Boolean(config.openAiUrl && config.openAiKey), circuit };
  }
  return { provider: "none", model: null, configured: false, circuit };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response, attempt) {
  const header = response?.headers?.get?.("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 10_000);
  }
  return 250 * (2 ** attempt) + crypto.randomInt(0, 250);
}

function geminiRequest(config, input) {
  const contents = input.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: String(message.content || "") }],
  }));
  const body = {
    contents,
    generationConfig: {
      ...(input.temperature != null ? { temperature: input.temperature } : {}),
      ...(input.maxTokens != null ? { maxOutputTokens: input.maxTokens } : {}),
      ...(input.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (input.system) body.systemInstruction = { parts: [{ text: input.system }] };
  return body;
}

function extractGeminiText(body) {
  const candidate = body?.candidates?.[0];
  const blocked = body?.promptFeedback?.blockReason
    || candidate?.finishReason === "SAFETY"
    || candidate?.finishReason === "BLOCKLIST";
  if (blocked) throw typedError("LLM_UNAVAILABLE", "The AI response was blocked by the provider safety filter.");
  const text = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join("");
  if (!text?.trim()) throw typedError("LLM_UNAVAILABLE", "The AI provider returned no usable response.");
  return text.trim();
}

async function callGemini(config, input, timeoutMs, modelName = config.geminiModel) {
  if (!config.geminiKey) throw typedError("LLM_NOT_CONFIGURED", "GEMINI_API_KEY is not configured.");
  const model = encodeURIComponent(modelName);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiKey },
      body: JSON.stringify(geminiRequest(config, input)),
      signal: controller.signal,
    });
    if (!response.ok) {
      let reason = "AI provider request failed.";
      try {
        const body = await response.json();
        reason = body?.error?.message || body?.error?.status || body?.promptFeedback?.blockReason || reason;
      } catch (_error) {}
      const retryAfterMs = retryDelayMs(response, 0);
      if (response.status === 429) throw Object.assign(new Error("AI provider rate limited the request."), { status: 429, code: "LLM_UNAVAILABLE", reason, retryAfterMs });
      if (response.status >= 500) throw Object.assign(new Error("AI provider is temporarily unavailable."), { status: response.status, code: "LLM_UNAVAILABLE", reason, retryAfterMs });
      throw Object.assign(new Error("AI provider request failed."), { status: response.status, code: "LLM_UNAVAILABLE", reason, retryAfterMs });
    }
    return extractGeminiText(await response.json());
  } catch (error) {
    if (error.name === "AbortError") throw typedError("LLM_UNAVAILABLE", "The AI provider timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiCompatible(config, input, timeoutMs) {
  if (!config.openAiUrl || !config.openAiKey) throw typedError("LLM_NOT_CONFIGURED", "LLM_API_URL and LLM_API_KEY are not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages = [];
    if (input.system) messages.push({ role: "system", content: input.system });
    for (const message of input.messages) messages.push({ role: message.role === "assistant" ? "assistant" : "user", content: String(message.content || "") });
    const response = await fetch(config.openAiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.openAiKey}` },
      body: JSON.stringify({
        model: config.openAiModel,
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
        ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) throw Object.assign(new Error("AI provider rate limited the request."), { status: 429, code: "LLM_UNAVAILABLE" });
      if (response.status >= 500) throw Object.assign(new Error("AI provider is temporarily unavailable."), { status: response.status, code: "LLM_UNAVAILABLE" });
      throw Object.assign(new Error("AI provider request failed."), { status: response.status, code: "LLM_UNAVAILABLE" });
    }
    const body = await response.json();
    const text = body.output || body.choices?.[0]?.message?.content;
    if (!text?.trim()) throw typedError("LLM_UNAVAILABLE", "The AI provider returned no usable response.");
    return text.trim();
  } catch (error) {
    if (error.name === "AbortError") throw typedError("LLM_UNAVAILABLE", "The AI provider timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateText(input) {
  const config = providerConfig();
  if (config.provider === "none") {
    const error = typedError("LLM_NOT_CONFIGURED", "No AI provider is configured.");
    logProviderFailure(config, error);
    throw error;
  }
  if (Date.now() < circuitOpenUntil) {
    const error = typedError("LLM_UNAVAILABLE", "The AI provider is temporarily unavailable.");
    error.reason = "circuit breaker open";
    logProviderFailure(config, error);
    throw error;
  }

  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : Number(process.env.LLM_TIMEOUT_MS || 20_000);
  const deadline = Date.now() + timeoutMs;

  if (config.provider === "gemini") {
    const models = [config.geminiModel];
    if (config.geminiFallbackModel && config.geminiFallbackModel !== config.geminiModel) {
      models.push(config.geminiFallbackModel);
    }
    let lastError;
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const modelName = models[modelIndex];
      for (let retry = 0; retry <= 3; retry += 1) {
        if (Date.now() >= deadline) {
          throw typedError("LLM_UNAVAILABLE", "The AI provider timed out.");
        }
        try {
          const text = await callGemini(config, input, Math.max(1, deadline - Date.now()), modelName);
          consecutiveFailures = 0;
          overloadFailureCount = 0;
          return { text, provider: "gemini", modelAlias: modelName };
        } catch (error) {
          lastError = error;
          const overload = error.status === 503 || error.status === 429;
          if (overload) {
            overloadFailureCount += 1;
            if (overloadFailureCount >= 8) circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
          } else {
            if (error.status && error.status >= 400 && error.status < 500) consecutiveFailures += 1;
            else if (error.status >= 500) consecutiveFailures += 1;
            if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
          }
          logProviderFailure({ ...config, provider: "gemini", geminiModel: modelName }, error);

          if (error.status === 404 && modelIndex === 0) break;
          if ((overload || error.status === 404) && retry < 3 && modelIndex === 0) {
            if (error.status === 404) break;
            const delay = error.retryAfterMs != null
              ? error.retryAfterMs
              : retryDelayMs(null, retry);
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            await sleep(Math.min(delay, remaining));
            continue;
          }
          if (modelIndex === 0 && (overload || error.status === 404)) break;
          throw error;
        }
      }
    }
    throw lastError || typedError("LLM_UNAVAILABLE", "The AI provider is unavailable.");
  }

  const maxRetries = Math.min(3, Math.max(0, Number(process.env.LLM_MAX_RETRIES ?? 1)));
  let attempt = 0;
  while (true) {
    try {
      const text = config.provider === "gemini"
        ? await callGemini(config, input, timeoutMs)
        : config.provider === "openai-compatible"
          ? await callOpenAiCompatible(config, input, timeoutMs)
          : (() => { throw typedError("LLM_NOT_CONFIGURED", "Unsupported AI provider."); })();
      consecutiveFailures = 0;
      return { text, provider: config.provider, modelAlias: config.provider === "gemini" ? config.geminiModel : config.openAiModel };
    } catch (error) {
      if (error.code === "LLM_NOT_CONFIGURED") {
        logProviderFailure(config, error);
        throw error;
      }
      logProviderFailure(config, error);
      consecutiveFailures += 1;
      if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
      const retryable = error.status === 429 || error.status >= 500 || error.code === "LLM_UNAVAILABLE";
      if (attempt < maxRetries && retryable) {
        attempt += 1;
        await sleep(250 * 2 ** (attempt - 1) + crypto.randomInt(0, 100));
        continue;
      }
      throw error;
    }
  }
}

async function generateJson(schema, input) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({ ...input, json: true });
      let parsed;
      try {
        parsed = JSON.parse(result.text);
      } catch (error) {
        lastError = error;
        continue;
      }
      try {
        return { ...result, output: schema.parse(parsed) };
      } catch (error) {
        lastError = error;
      }
    } catch (error) {
      throw error;
    }
  }
  throw typedError("LLM_UNAVAILABLE", "The AI provider returned invalid JSON.");
}

function resetCircuitState() {
  consecutiveFailures = 0;
  overloadFailureCount = 0;
  circuitOpenUntil = 0;
}

module.exports = { generateText, generateJson, healthInfo, providerConfig, resetCircuitState, GEMINI_DEFAULT_MODEL };
