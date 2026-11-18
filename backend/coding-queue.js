"use strict";

const { Queue } = require("bullmq");

let queue;

function redisConnection() {
  if (!process.env.REDIS_URL) {
    const error = new Error("REDIS_URL is required for coding execution.");
    error.code = "CODING_QUEUE_UNAVAILABLE";
    throw error;
  }
  const url = new URL(process.env.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined };
}

function getCodingQueue() {
  if (!queue) queue = new Queue("coding-execution", { connection: redisConnection() });
  return queue;
}

async function enqueueCodingRun(runId) {
  await getCodingQueue().add("execute-run", { kind: "run", id: runId }, {
    jobId: `coding-run-${runId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 1_000,
  });
}

async function enqueueCodingSubmission(submissionId) {
  await getCodingQueue().add("execute-submission", { kind: "submission", id: submissionId }, {
    jobId: `coding-submission-${submissionId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 1_000,
  });
}

async function closeCodingQueue() {
  if (queue) await queue.close();
  queue = undefined;
}

module.exports = { getCodingQueue, enqueueCodingRun, enqueueCodingSubmission, closeCodingQueue, redisConnection };
