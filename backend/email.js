"use strict";

const { validateEnv } = require("./config/env");

function getEmailProviderConfig() {
  const config = validateEnv();
  if (!config.EMAIL_API_URL || !config.EMAIL_API_KEY) {
    throw Object.assign(new Error("Email delivery is not configured."), {
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      status: 503,
    });
  }
  return {
    url: config.EMAIL_API_URL,
    key: config.EMAIL_API_KEY,
    provider: config.EMAIL_PROVIDER || "http-json",
  };
}

async function sendEmail({ to, subject, text }) {
  const config = getEmailProviderConfig();
  let response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ to, subject, text }),
    });
  } catch (cause) {
    throw Object.assign(new Error("Email provider could not deliver the message."), {
      code: "EMAIL_PROVIDER_FAILED",
      status: 503,
      cause,
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error("Email provider could not deliver the message."), {
      code: "EMAIL_PROVIDER_FAILED",
      status: 503,
    });
  }
  return { provider: config.provider, delivered: true };
}

module.exports = { sendEmail, getEmailProviderConfig };
