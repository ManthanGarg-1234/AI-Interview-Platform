"use strict";

const endpoint = "https://api.jdoodle.com/v1/credit-spent";
const { postJson } = require("./jdoodle");

let cachedUsage = null;
let reservedCredits = 0;
let usageRequest;
let reservationQueue = Promise.resolve();

function usageConfiguration() {
  const rawLimit = process.env.JDOODLE_DAILY_CREDIT_LIMIT;
  const dailyLimit =
    rawLimit === undefined || rawLimit === "" ? 20 : Number(rawLimit);
  const rawTtl = process.env.JDOODLE_CREDIT_CACHE_TTL_MS;
  const cacheTtlMs =
    rawTtl === undefined || rawTtl === "" ? 60_000 : Number(rawTtl);
  if (
    !Number.isSafeInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 1_000_000
  ) {
    throw Object.assign(
      new Error("JDOODLE_DAILY_CREDIT_LIMIT must be a positive integer."),
      { code: "JDOODLE_CONFIGURATION_INVALID", status: 503 },
    );
  }
  if (
    !Number.isSafeInteger(cacheTtlMs) ||
    cacheTtlMs < 10_000 ||
    cacheTtlMs > 600_000
  ) {
    throw Object.assign(
      new Error(
        "JDOODLE_CREDIT_CACHE_TTL_MS must be between 10000 and 600000.",
      ),
      { code: "JDOODLE_CONFIGURATION_INVALID", status: 503 },
    );
  }
  return { dailyLimit, cacheTtlMs };
}

async function getUsage({ force = false } = {}) {
  const { dailyLimit, cacheTtlMs } = usageConfiguration();
  if (
    !force &&
    cachedUsage &&
    Date.now() - cachedUsage.checkedAt < cacheTtlMs
  ) {
    return {
      ...cachedUsage,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - cachedUsage.used - reservedCredits),
    };
  }
  if (!usageRequest) {
    usageRequest = (async () => {
      const response = await postJson(endpoint, {}, { phase: "credit-spent" });
      const used = Number(response.used);
      if (!Number.isSafeInteger(used) || used < 0) {
        throw Object.assign(
          new Error("JDoodle returned an invalid credit usage response."),
          {
            code: "JDOODLE_PROVIDER_RESPONSE_INVALID",
            status: 503,
            retryable: false,
          },
        );
      }
      cachedUsage = { used, checkedAt: Date.now() };
      return cachedUsage;
    })().finally(() => {
      usageRequest = null;
    });
  }
  await usageRequest;
  return {
    ...cachedUsage,
    dailyLimit,
    remaining: Math.max(0, dailyLimit - cachedUsage.used - reservedCredits),
  };
}

async function ensureCreditsAvailable(required = 1) {
  if (!Number.isSafeInteger(required) || required < 1) {
    throw Object.assign(
      new Error("A positive execution credit estimate is required."),
      { code: "JDOODLE_CONFIGURATION_INVALID", status: 503 },
    );
  }
  const usage = await getUsage();
  if (usage.used + reservedCredits + required > usage.dailyLimit) {
    throw Object.assign(
      new Error("Not enough JDoodle daily credits remain for this execution."),
      {
        code: "JDOODLE_CREDITS_EXHAUSTED",
        status: 429,
        retryable: false,
        usage,
      },
    );
  }
  return usage;
}

async function reserveExecutionCredit() {
  let releaseQueue;
  const previous = reservationQueue;
  reservationQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  let usage;
  try {
    usage = await ensureCreditsAvailable(1);
    reservedCredits += 1;
  } finally {
    releaseQueue();
  }
  let settled = false;
  return {
    commit() {
      if (settled) return;
      settled = true;
      reservedCredits = Math.max(0, reservedCredits - 1);
      if (cachedUsage)
        cachedUsage = { ...cachedUsage, used: cachedUsage.used + 1 };
    },
    release({ refresh = false } = {}) {
      if (settled) return;
      settled = true;
      reservedCredits = Math.max(0, reservedCredits - 1);
      if (refresh) cachedUsage = null;
    },
  };
}

function invalidateUsage() {
  cachedUsage = null;
}

module.exports = {
  getUsage,
  ensureCreditsAvailable,
  reserveExecutionCredit,
  invalidateUsage,
  usageConfiguration,
};
