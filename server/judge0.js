"use strict";

async function judge0Request(pathname, options) {
  if (!process.env.JUDGE0_URL) throw Object.assign(new Error("A Judge0 execution service is not configured."), { code: "JUDGE_UNAVAILABLE" });
  const headers = { "content-type": "application/json" };
  if (process.env.JUDGE0_API_KEY) headers["x-rapidapi-key"] = process.env.JUDGE0_API_KEY;
  if (process.env.JUDGE0_HOST) headers["x-rapidapi-host"] = process.env.JUDGE0_HOST;
  const response = await fetch(new URL(pathname, process.env.JUDGE0_URL), { method: options.method || "GET", headers, body: options.body && JSON.stringify(options.body), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error("The configured judge service returned an unavailable response."), { code: "JUDGE_UNAVAILABLE" });
  return response.json();
}

async function createJavaSubmission(sourceCode, stdin, expectedOutput) {
  return judge0Request("/submissions?base64_encoded=false&wait=true", {
    method: "POST",
    body: { language_id: 62, source_code: sourceCode, stdin, expected_output: expectedOutput }
  });
}

module.exports = { createJavaSubmission };
