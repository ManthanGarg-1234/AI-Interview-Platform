"use strict";

const languageEnvironment = {
  Java: "JUDGE0_JAVA_ID",
  "C++": "JUDGE0_CPP_ID",
  Python: "JUDGE0_PYTHON_ID",
  JavaScript: "JUDGE0_JAVASCRIPT_ID",
};

const terminalStatuses = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);

function configuration() {
  if (!process.env.JUDGE0_URL) {
    const error = new Error("JUDGE0_URL is required for coding execution.");
    error.code = "JUDGE0_UNAVAILABLE";
    throw error;
  }
  const languageIds = Object.fromEntries(Object.entries(languageEnvironment).map(([language, variable]) => {
    const value = Number(process.env[variable]);
    if (!Number.isInteger(value) || value < 1) throw Object.assign(new Error(`${variable} must be a positive integer.`), { code: "JUDGE0_CONFIGURATION_INVALID" });
    return [language, value];
  }));
  return {
    baseUrl: process.env.JUDGE0_URL.replace(/\/+$/, ""),
    languageIds,
    pollIntervalMs: Math.max(100, Number(process.env.JUDGE0_POLL_INTERVAL_MS || 500)),
    maxPollAttempts: Math.max(1, Number(process.env.JUDGE0_MAX_POLL_ATTEMPTS || 30)),
    base64: process.env.JUDGE0_BASE64 !== "false",
  };
}

function headers() {
  const result = { "content-type": "application/json" };
  if (process.env.JUDGE0_API_KEY) result["x-rapidapi-key"] = process.env.JUDGE0_API_KEY;
  if (process.env.JUDGE0_AUTH_HEADER) {
    const separator = process.env.JUDGE0_AUTH_HEADER.indexOf(":");
    if (separator <= 0) throw Object.assign(new Error("JUDGE0_AUTH_HEADER must use Header: value format."), { code: "JUDGE0_CONFIGURATION_INVALID" });
    result[process.env.JUDGE0_AUTH_HEADER.slice(0, separator).trim()] = process.env.JUDGE0_AUTH_HEADER.slice(separator + 1).trim();
  }
  return result;
}

function encode(value, enabled) {
  return enabled ? Buffer.from(value || "", "utf8").toString("base64") : (value || "");
}

function decode(value, enabled) {
  if (!value) return "";
  if (!enabled) return value;
  try { return Buffer.from(value, "base64").toString("utf8"); } catch { return value; }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusToVerdict(statusId) {
  return {
    3: "ACCEPTED",
    4: "WRONG_ANSWER",
    5: "TIME_LIMIT_EXCEEDED",
    6: "COMPILATION_ERROR",
    7: "RUNTIME_ERROR",
    8: "RUNTIME_ERROR",
    9: "TIME_LIMIT_EXCEEDED",
    10: "INTERNAL_ERROR",
    11: "RUNTIME_ERROR",
    12: "RUNTIME_ERROR",
    13: "INTERNAL_ERROR",
    14: "INTERNAL_ERROR",
    15: "INTERNAL_ERROR",
    16: "MEMORY_LIMIT_EXCEEDED",
    17: "INTERNAL_ERROR",
  }[statusId] || "INTERNAL_ERROR";
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw Object.assign(new Error(`Judge0 request failed: ${error.message}`), { code: "JUDGE0_PROVIDER_ERROR", cause: error });
  }
  if (!response.ok) {
    const error = new Error(`Judge0 returned HTTP ${response.status}.`);
    error.code = response.status === 429 ? "JUDGE0_RATE_LIMITED" : response.status >= 500 ? "JUDGE0_PROVIDER_ERROR" : "JUDGE0_REQUEST_REJECTED";
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return response.json();
}

async function submitAndPoll({ language, sourceCode, stdin, cpuTimeLimitMs, memoryLimitKb }) {
  const config = configuration();
  const tokenResponse = await request(`${config.baseUrl}/submissions?base64_encoded=${config.base64 ? "true" : "false"}&wait=false`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      language_id: config.languageIds[language],
      source_code: encode(sourceCode, config.base64),
      stdin: encode(stdin, config.base64),
      cpu_time_limit: Math.max(0.1, cpuTimeLimitMs / 1000),
      memory_limit: memoryLimitKb * 1024,
      max_file_size: 1_048_576,
      enable_network: false,
    }),
  });
  if (!tokenResponse.token) throw Object.assign(new Error("Judge0 did not return a submission token."), { code: "JUDGE0_PROVIDER_ERROR", retryable: true });
  let delay = config.pollIntervalMs;
  for (let attempt = 0; attempt < config.maxPollAttempts; attempt += 1) {
    const result = await request(`${config.baseUrl}/submissions/${encodeURIComponent(tokenResponse.token)}?base64_encoded=${config.base64 ? "true" : "false"}`, { headers: headers() });
    if (terminalStatuses.has(result.status?.id)) {
      return {
        providerRequestId: tokenResponse.token,
        verdict: statusToVerdict(result.status.id),
        statusId: result.status.id,
        stdout: decode(result.stdout, config.base64),
        stderr: decode(result.stderr, config.base64),
        compileOutput: decode(result.compile_output, config.base64),
        executionTimeMs: result.time ? Math.round(Number(result.time) * 1000) : null,
        memoryKb: result.memory ? Math.round(Number(result.memory) / 1024) : null,
        raw: result,
      };
    }
    await wait(delay);
    delay = Math.min(delay * 2, 5_000);
  }
  throw Object.assign(new Error("Judge0 polling timed out."), { code: "JUDGE0_POLL_TIMEOUT", retryable: true });
}

module.exports = { configuration, submitAndPoll, statusToVerdict, encode, decode, languageEnvironment };
