"use strict";

const endpoint = "https://api.jdoodle.com/v1/execute";
const javaLanguage = "java";
const javaVersionIndex = 5;

function configuration() {
  const clientId = process.env.JDOODLE_CLIENT_ID;
  const clientSecret = process.env.JDOODLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("JDoodle credentials are not configured."), {
      code: "JDOODLE_UNAVAILABLE",
      status: 503,
    });
  }
  const rawVersionIndex =
    process.env.JDOODLE_JAVA_VERSION_INDEX || String(javaVersionIndex);
  const versionIndex = Number(rawVersionIndex);
  if (!Number.isSafeInteger(versionIndex) || versionIndex < 0) {
    throw Object.assign(
      new Error("JDOODLE_JAVA_VERSION_INDEX must be a non-negative integer."),
      { code: "JDOODLE_CONFIGURATION_INVALID", status: 503 },
    );
  }
  const rawTimeout = process.env.JDOODLE_REQUEST_TIMEOUT_MS;
  const requestTimeoutMs =
    rawTimeout === undefined || rawTimeout === "" ? 20_000 : Number(rawTimeout);
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 500 ||
    requestTimeoutMs > 60_000
  ) {
    throw Object.assign(
      new Error(
        "JDOODLE_REQUEST_TIMEOUT_MS must be an integer between 500 and 60000.",
      ),
      { code: "JDOODLE_CONFIGURATION_INVALID", status: 503 },
    );
  }
  return {
    clientId,
    clientSecret,
    javaLanguage,
    versionIndex: String(versionIndex),
    requestTimeoutMs,
  };
}

function safeStatusCode(body) {
  const value = Number(body?.statusCode);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function rawProviderError(body) {
  if (typeof body?.error === "string") return body.error;
  if (
    body?.error &&
    typeof body.error === "object" &&
    !Array.isArray(body.error)
  ) {
    if (typeof body.error.message === "string") return body.error.message;
    if (typeof body.error.description === "string")
      return body.error.description;
  }
  return null;
}

function sanitizeDiagnosticText(value, sensitiveValues = []) {
  if (typeof value !== "string") return null;
  let safe = value;
  const values = [
    ...new Set(
      sensitiveValues.filter((item) => typeof item === "string" && item.length),
    ),
  ].sort((left, right) => right.length - left.length);
  for (const secret of values) safe = safe.split(secret).join("[REDACTED]");
  return safe
    .replace(
      /\bAuthorization\s*[:=]\s*(?:Bearer|Basic)\s+[^\s,;}]+/gi,
      "Authorization: [REDACTED]",
    )
    .replace(/\bBearer\s+[^\s,;}]+/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=.-]+/gi, "Basic [REDACTED]")
    .replace(
      /"?(client[_ -]?id|client[_ -]?secret|authorization|access[_ -]?token|password|token|script|source(?:[_ -]?code)?|program(?:[_ -]?code)?|stdin|input(?:[_ -]?data)?|expected(?:[_ -]?output)?)"?\s*[:=]\s*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,;}]+)/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 1000);
}

function providerRequestId(body, sensitiveValues) {
  const keys = [
    "requestId",
    "request_id",
    "referenceId",
    "reference_id",
    "executionId",
    "execution_id",
  ];
  for (const source of [body, body?.error]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" || typeof value === "number") {
        return (
          sanitizeDiagnosticText(String(value), sensitiveValues)?.slice(
            0,
            160,
          ) || null
        );
      }
    }
  }
  return null;
}

function providerFailure(code, message, context = {}) {
  const providerMessage = sanitizeDiagnosticText(
    rawProviderError(context.body),
    context.sensitiveValues,
  );
  const safeMessage = providerMessage
    ? `${message} ${providerMessage}`
    : message;
  const diagnostics = {
    provider: "jdoodle",
    phase: context.phase || "unknown",
    httpStatus: Number.isInteger(context.httpStatus)
      ? context.httpStatus
      : null,
    jdoodleStatusCode: safeStatusCode(context.body),
    providerRequestId: providerRequestId(context.body, context.sensitiveValues),
    errorMessage: providerMessage,
  };
  const error = Object.assign(new Error(safeMessage), {
    code,
    status: context.status || 503,
    ...(context.retryable === undefined
      ? {}
      : { retryable: context.retryable }),
    safeMessage,
    providerDiagnostics: diagnostics,
    providerStatus: diagnostics.httpStatus,
    providerMessage,
  });
  console.error("JDoodle provider request failed.", {
    ...diagnostics,
    code,
  });
  return error;
}

function providerError(httpStatus, body = {}, context = {}) {
  const jdoodleStatusCode = safeStatusCode(body);
  const status =
    httpStatus === 401 || jdoodleStatusCode === 401
      ? 401
      : httpStatus === 429 || jdoodleStatusCode === 429
        ? 429
        : httpStatus >= 500 ||
            (jdoodleStatusCode !== null && jdoodleStatusCode >= 500)
          ? 500
          : jdoodleStatusCode && jdoodleStatusCode !== 200
            ? jdoodleStatusCode
            : httpStatus;
  if (status === 401) {
    return providerFailure(
      "JDOODLE_AUTHENTICATION_FAILED",
      "JDoodle rejected the configured credentials.",
      { ...context, httpStatus, body },
    );
  }
  if (status === 429) {
    return providerFailure(
      "JDOODLE_CREDITS_EXHAUSTED",
      "JDoodle daily execution credits are exhausted.",
      { ...context, httpStatus, body, status: 429, retryable: false },
    );
  }
  return providerFailure(
    status >= 500 ? "JDOODLE_PROVIDER_ERROR" : "JDOODLE_REQUEST_REJECTED",
    "JDoodle rejected the execution request.",
    { ...context, httpStatus, body },
  );
}

async function postJson(
  url,
  payload,
  {
    creditReservation,
    phase = "provider-request",
    sensitiveValues = [],
    executionKind,
  } = {},
) {
  const config = configuration();
  const diagnosticContext = {
    phase,
    sensitiveValues: [config.clientId, config.clientSecret, ...sensitiveValues],
  };
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ...payload,
      }),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (cause) {
    const timedOut =
      cause.name === "TimeoutError" || cause.name === "AbortError";
    creditReservation?.release({ refresh: true });
    throw Object.assign(
      providerFailure(
        timedOut ? "JDOODLE_REQUEST_TIMEOUT" : "JDOODLE_PROVIDER_UNAVAILABLE",
        timedOut
          ? "JDoodle request timed out."
          : "JDoodle could not be reached.",
        { ...diagnosticContext, httpStatus: null, retryable: false },
      ),
      { cause },
    );
  }
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    if (response.ok) creditReservation?.commit();
    else creditReservation?.release({ refresh: response.status === 429 });
    throw Object.assign(
      providerFailure(
        "JDOODLE_PROVIDER_RESPONSE_INVALID",
        "JDoodle returned an invalid JSON response.",
        { ...diagnosticContext, httpStatus: response.status, retryable: false },
      ),
      { cause },
    );
  }
  if (!response.ok) {
    creditReservation?.release({ refresh: response.status === 429 });
    throw providerError(response.status, body, diagnosticContext);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    creditReservation?.commit();
    throw providerFailure(
      "JDOODLE_PROVIDER_RESPONSE_INVALID",
      "JDoodle returned an invalid response.",
      { ...diagnosticContext, httpStatus: response.status, retryable: false },
    );
  }
  if (body.error !== undefined) {
    creditReservation?.release({ refresh: true });
    throw providerError(response.status, body, diagnosticContext);
  }
  if (body.statusCode !== undefined && body.statusCode !== 200) {
    creditReservation?.release({ refresh: body.statusCode === 429 });
    throw providerError(response.status, body, diagnosticContext);
  }
  if (executionKind && body.statusCode === undefined) {
    creditReservation?.commit();
    throw providerFailure(
      "JDOODLE_PROVIDER_RESPONSE_INVALID",
      "JDoodle response did not include a valid statusCode.",
      {
        ...diagnosticContext,
        httpStatus: response.status,
        body,
        retryable: false,
      },
    );
  }
  if (
    executionKind === "compileOnly" &&
    (typeof body.output !== "string" ||
      ![0, 1, "0", "1"].includes(body.compilationStatus))
  ) {
    throw providerFailure(
      "JDOODLE_PROVIDER_RESPONSE_INVALID",
      "JDoodle returned a malformed compilation response.",
      {
        ...diagnosticContext,
        httpStatus: response.status,
        body,
        retryable: false,
      },
    );
  }
  if (executionKind === "execute" && typeof body.output !== "string") {
    creditReservation?.commit();
    throw providerFailure(
      "JDOODLE_PROVIDER_RESPONSE_INVALID",
      "JDoodle returned an execution response without output.",
      {
        ...diagnosticContext,
        httpStatus: response.status,
        body,
        retryable: false,
      },
    );
  }
  creditReservation?.commit();
  return body;
}

function assertExecutionResponse(body, context = {}) {
  if (body.statusCode !== 200) {
    throw providerError(context.httpStatus, body, context);
  }
}

function assertJava(language) {
  if (language !== "Java") {
    throw Object.assign(new Error("Only Java execution is enabled."), {
      code: "CODING_LANGUAGE_UNSUPPORTED",
      status: 400,
      retryable: false,
    });
  }
}

function compileStatus(body) {
  if (
    typeof body.output !== "string" ||
    ![0, 1, "0", "1"].includes(body.compilationStatus)
  ) {
    throw Object.assign(
      new Error("JDoodle returned a malformed compilation response."),
      {
        code: "JDOODLE_PROVIDER_RESPONSE_INVALID",
        status: 503,
        retryable: false,
      },
    );
  }
  return {
    compiled: Number(body.compilationStatus) === 0,
    output: body.output,
  };
}

async function compile({ language, sourceCode }) {
  assertJava(language);
  if (typeof sourceCode !== "string" || sourceCode.length === 0) {
    throw Object.assign(new Error("Source code is required."), {
      code: "JDOODLE_REQUEST_INVALID",
      status: 400,
      retryable: false,
    });
  }
  const config = configuration();
  const body = await postJson(
    endpoint,
    {
      script: sourceCode,
      language: config.javaLanguage,
      versionIndex: config.versionIndex,
      compileOnly: true,
    },
    {
      phase: "compileOnly",
      sensitiveValues: [sourceCode],
      executionKind: "compileOnly",
    },
  );
  return compileStatus(body);
}

function numericMetric(value, multiplier = 1) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * multiplier)
    : null;
}

function classifyOutput(output) {
  if (
    /\b(?:timed?\s*out|time limit exceeded|execution timeout)\b/i.test(output)
  )
    return "TIME_LIMIT_EXCEEDED";
  if (
    /\b(?:Exception in thread|^\s*at\s+[\w.$]+\([^\n]*\)|(?:java\.lang\.)\w+(?:Exception|Error)\b)/m.test(
      output,
    )
  )
    return "RUNTIME_ERROR";
  return "ACCEPTED";
}

async function submitAndPoll({ language, sourceCode, stdin }) {
  assertJava(language);
  if (
    typeof sourceCode !== "string" ||
    sourceCode.length === 0 ||
    typeof stdin !== "string"
  ) {
    throw Object.assign(
      new Error("Source code and standard input must be strings."),
      { code: "JDOODLE_REQUEST_INVALID", status: 400, retryable: false },
    );
  }
  const config = configuration();
  const creditReservation =
    await require("./jdoodle-credits").reserveExecutionCredit();
  const body = await postJson(
    endpoint,
    {
      script: sourceCode,
      stdin,
      language: config.javaLanguage,
      versionIndex: config.versionIndex,
    },
    {
      creditReservation,
      phase: "execute",
      sensitiveValues: [sourceCode, stdin],
      executionKind: "execute",
    },
  );
  const verdict = classifyOutput(body.output);
  const cpuTimeMs = numericMetric(body.cpuTime, 1000);
  const memoryKb = numericMetric(body.memory);
  return {
    verdict,
    stdout: verdict === "ACCEPTED" ? body.output : "",
    stderr:
      verdict === "RUNTIME_ERROR" || verdict === "TIME_LIMIT_EXCEEDED"
        ? body.output
        : "",
    compileOutput: "",
    executionTimeMs: cpuTimeMs,
    memoryKb,
  };
}

async function diagnose() {
  try {
    configuration();
    const usage = await require("./jdoodle-credits").getUsage();
    return {
      status: usage.remaining > 0 ? "ready" : "credits_exhausted",
      configured: true,
      usage,
    };
  } catch (error) {
    return {
      status:
        error.code === "JDOODLE_UNAVAILABLE"
          ? "not_configured"
          : error.code === "JDOODLE_AUTHENTICATION_FAILED"
            ? "authentication_failed"
            : error.code === "JDOODLE_CREDITS_EXHAUSTED"
              ? "credits_exhausted"
              : error.code === "JDOODLE_CONFIGURATION_INVALID"
                ? "invalid_configuration"
                : "unavailable",
      configured: false,
      ...(error.code === "JDOODLE_CREDITS_EXHAUSTED"
        ? { usage: error.usage }
        : {}),
    };
  }
}

module.exports = {
  configuration,
  diagnose,
  compile,
  submitAndPoll,
  providerError,
  postJson,
  assertExecutionResponse,
  numericMetric,
  classifyOutput,
};
