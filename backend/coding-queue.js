"use strict";

const { Queue } = require("bullmq");

let queue;

function redisConnection() {
  if (!process.env.REDIS_URL) {
    const error = new Error("REDIS_URL is required for coding execution.");
    error.code = "CODING_QUEUE_UNAVAILABLE";
    throw error;
  }
  let url;
  try {
    url = new URL(process.env.REDIS_URL);
  } catch {
    throw Object.assign(new Error("REDIS_URL must be a valid Redis URL."), {
      code: "CODING_QUEUE_CONFIGURATION_INVALID",
    });
  }
  if (!["redis:", "rediss:"].includes(url.protocol) || url.search || url.hash) {
    throw Object.assign(
      new Error(
        "REDIS_URL must use redis:// or rediss:// without query parameters or fragments.",
      ),
      { code: "CODING_QUEUE_CONFIGURATION_INVALID" },
    );
  }
  const port = Number(url.port || 6379);
  const databasePath = url.pathname.replace(/^\/+/, "");
  const database = databasePath === "" ? undefined : Number(databasePath);
  if (
    !url.hostname ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (databasePath !== "" &&
      (!/^\d+$/.test(databasePath) ||
        !Number.isSafeInteger(database) ||
        database < 0))
  ) {
    throw Object.assign(
      new Error(
        "REDIS_URL contains an invalid host, port, or database number.",
      ),
      { code: "CODING_QUEUE_CONFIGURATION_INVALID" },
    );
  }
  let username;
  let password;
  try {
    username = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } catch {
    throw Object.assign(
      new Error("REDIS_URL contains invalid encoded credentials."),
      { code: "CODING_QUEUE_CONFIGURATION_INVALID" },
    );
  }
  return {
    host: url.hostname,
    port,
    ...(database === undefined ? {} : { db: database }),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

function getCodingQueue() {
  if (!queue) {
    queue = new Queue("coding-execution", { connection: redisConnection() });
    queue.on("error", (error) =>
      console.error("Coding queue connection failed.", {
        code: error.code || "REDIS_CONNECTION_FAILED",
      }),
    );
  }
  return queue;
}

async function enqueueCodingRun(runId) {
  await getCodingQueue().add(
    "execute-run",
    { kind: "run", id: runId, provider: "jdoodle" },
    {
      jobId: `coding-run-${runId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 1_000,
    },
  );
}

async function enqueueCodingSubmission(submissionId) {
  await getCodingQueue().add(
    "execute-submission",
    { kind: "submission", id: submissionId, provider: "jdoodle" },
    {
      jobId: `coding-submission-${submissionId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 1_000,
    },
  );
}

async function closeCodingQueue() {
  if (queue) await queue.close();
  queue = undefined;
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            Object.assign(new Error("Redis health check timed out."), {
              code: "REDIS_HEALTH_TIMEOUT",
            }),
          ),
        timeoutMs,
      );
      timeout.unref?.();
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function diagnoseCodingQueue() {
  if (!process.env.REDIS_URL)
    return { redis: "not_configured", workerCount: null };
  try {
    redisConnection();
    const codingQueue = getCodingQueue();
    await withTimeout(codingQueue.getJobCounts("waiting"), 2_000);
    try {
      const workers = await withTimeout(codingQueue.getWorkers(), 2_000);
      return { redis: "ready", workerCount: workers.length };
    } catch {
      return { redis: "ready", workerCount: null };
    }
  } catch (error) {
    return {
      redis:
        error.code === "CODING_QUEUE_CONFIGURATION_INVALID"
          ? "invalid_configuration"
          : error.code === "CODING_QUEUE_UNAVAILABLE"
            ? "not_configured"
            : "unavailable",
      workerCount: null,
    };
  }
}

async function assertCodingWorkerAvailable() {
  const health = await diagnoseCodingQueue();
  if (health.redis !== "ready") {
    const code =
      health.redis === "invalid_configuration"
        ? "CODING_QUEUE_CONFIGURATION_INVALID"
        : health.redis === "not_configured"
          ? "CODING_QUEUE_UNAVAILABLE"
          : "CODING_REDIS_UNAVAILABLE";
    throw Object.assign(new Error("The coding Redis queue is unavailable."), {
      code,
      status: 503,
    });
  }
  if (health.workerCount === 0) {
    throw Object.assign(
      new Error("No coding worker is registered for the BullMQ queue."),
      { code: "CODING_WORKER_UNAVAILABLE", status: 503 },
    );
  }
  if (health.workerCount === null) {
    throw Object.assign(new Error("The coding worker could not be verified."), {
      code: "CODING_WORKER_STATUS_UNKNOWN",
      status: 503,
    });
  }
}

module.exports = {
  getCodingQueue,
  enqueueCodingRun,
  enqueueCodingSubmission,
  closeCodingQueue,
  redisConnection,
  diagnoseCodingQueue,
  assertCodingWorkerAvailable,
};
