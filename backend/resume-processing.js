"use strict";

const { Queue } = require("bullmq");

let queue;
function getQueue() {
  if (!process.env.REDIS_URL) return null;
  if (!queue) {
    const url = new URL(process.env.REDIS_URL);
    queue = new Queue("resume-processing", {
      connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined },
    });
  }
  return queue;
}
async function enqueueResumeProcessing(resumeVersionId) {
  const current = getQueue();
  if (!current) return { queued: false, reason: "REDIS_NOT_CONFIGURED" };
  await current.add("extract-text", { resumeVersionId }, {
    jobId: `resume-version-${resumeVersionId}`,
    removeOnComplete: 100,
    removeOnFail: 1000,
  });
  return { queued: true };
}

module.exports = { enqueueResumeProcessing };
