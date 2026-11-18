"use strict";

const crypto = require("node:crypto");
const Redis = require("ioredis");

const incrementScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return { count, redis.call("TTL", KEYS[1]) }
`;

const rateLimitNamespace = process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT
  ? crypto.randomUUID()
  : "shared";
let client;
let connecting;
const testCounters = new Map();

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
      return null;
    }
    const error = new Error("Redis is required for authentication rate limiting.");
    error.code = "AUTH_RATE_LIMIT_UNAVAILABLE";
    throw error;
  }
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on("error", (error) => console.error("Authentication rate-limit Redis error", error.code || "REDIS_ERROR"));
  }
  if (client.status === "wait") {
    connecting ||= client.connect().finally(() => { connecting = null; });
    await connecting;
  }
  if (client.status !== "ready") {
    const error = new Error("Redis is unavailable for authentication rate limiting.");
    error.code = "AUTH_RATE_LIMIT_UNAVAILABLE";
    throw error;
  }
  return client;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function authRateLimit({ name, windowSeconds, ipLimit, accountLimit, accountSource = "email" }) {
  return async (req, res, next) => {
    try {
      const client = await getRedisClient();
      const keys = [{
        key: `careerprepai:auth:rate:${rateLimitNamespace}:${name}:ip:${digest(req.ip || "unknown")}`,
        limit: ipLimit,
      }];
      const identity = accountSource === "refresh"
        ? req.cookies?.career_refresh
        : accountSource === "token"
          ? String(req.body?.token || "").slice(0, 128)
          : accountSource === "user"
            ? req.auth?.sub
          : String(req.body?.email || "").trim().toLowerCase().slice(0, 320);
      if (identity) {
        keys.push({
          key: `careerprepai:auth:rate:${rateLimitNamespace}:${name}:identity:${digest(identity)}`,
          limit: accountLimit,
        });
      }
      if (!client) {
        const now = Date.now();
        const exceeded = keys.filter(({ key, limit }) => {
          const record = testCounters.get(key);
          if (!record || record.expiresAt <= now) {
            testCounters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
            return false;
          }
          record.count += 1;
          return record.count > limit;
        });
        if (exceeded.length) return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Try again later." } });
        return next();
      }
      const results = await Promise.all(keys.map(async ({ key, limit }) => {
        const [count, ttl] = await client.eval(incrementScript, 1, key, windowSeconds);
        return { count: Number(count), ttl: Number(ttl), limit };
      }));
      const exceeded = results.filter(({ count, limit }) => count > limit);
      if (exceeded.length) {
        res.setHeader("Retry-After", String(Math.max(...exceeded.map(({ ttl }) => Math.max(ttl, 1)))));
        return res.status(429).json({
          error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Try again later." },
        });
      }
      next();
    } catch (error) {
      next(Object.assign(new Error("Authentication rate limiting is temporarily unavailable."), {
        code: "AUTH_RATE_LIMIT_UNAVAILABLE",
        cause: error,
      }));
    }
  };
}

async function closeAuthRateLimitRedis() {
  if (!client) return;
  const activeClient = client;
  client = null;
  connecting = null;
  if (activeClient.status === "ready") await activeClient.quit();
  else activeClient.disconnect();
}

module.exports = { authRateLimit, closeAuthRateLimitRedis };
