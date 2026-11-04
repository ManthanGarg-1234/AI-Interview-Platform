"use strict";

async function sendEmail({ to, subject, text }) {
  if (!process.env.EMAIL_API_URL || !process.env.EMAIL_API_KEY) {
    console.info(`[development-email] to=${to} subject=${subject}`);
    return { provider: "development", delivered: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }
  const response = await fetch(process.env.EMAIL_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.EMAIL_API_KEY}` },
    body: JSON.stringify({ to, subject, text }),
  });
  if (!response.ok) throw Object.assign(new Error("Email provider returned an error."), { code: "EMAIL_PROVIDER_FAILED" });
  return { provider: process.env.EMAIL_PROVIDER || "configured", delivered: true };
}

module.exports = { sendEmail };
