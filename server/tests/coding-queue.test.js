"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { redisConnection } = require("../coding-queue");

const originalRedisUrl = process.env.REDIS_URL;

test.afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

test("Redis URL supports database selection and authenticated connections", () => {
  process.env.REDIS_URL = "redis://worker:secret%40value@cache.example:6380/2";
  assert.deepEqual(redisConnection(), {
    host: "cache.example",
    port: 6380,
    db: 2,
    username: "worker",
    password: "secret@value",
  });
});

test("Redis TLS URLs enable TLS without exposing credentials elsewhere", () => {
  process.env.REDIS_URL = "rediss://default:secret@cache.example/0";
  assert.deepEqual(redisConnection(), {
    host: "cache.example",
    port: 6379,
    db: 0,
    username: "default",
    password: "secret",
    tls: {},
  });
});

test("invalid Redis URLs fail as configuration errors", () => {
  for (const value of ["https://cache.example", "redis://cache.example/not-a-db", "redis://cache.example/0?tls=true"]) {
    process.env.REDIS_URL = value;
    assert.throws(() => redisConnection(), { code: "CODING_QUEUE_CONFIGURATION_INVALID" });
  }
});

test("missing Redis URL fails explicitly", () => {
  delete process.env.REDIS_URL;
  assert.throws(() => redisConnection(), { code: "CODING_QUEUE_UNAVAILABLE" });
});
