"use strict";

function redisConfigurationError(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    code: "REDIS_CONFIGURATION_INVALID",
  });
}

function redisConnection(redisUrl = process.env.REDIS_URL) {
  if (!redisUrl) {
    throw Object.assign(new Error("REDIS_URL is required for queue processing."), {
      code: "REDIS_NOT_CONFIGURED",
    });
  }

  let url;
  try {
    url = new URL(redisUrl);
  } catch (error) {
    throw redisConfigurationError("REDIS_URL must be a valid Redis URL.", error);
  }

  if (!["redis:", "rediss:"].includes(url.protocol) || url.search || url.hash) {
    throw redisConfigurationError("REDIS_URL must use redis:// or rediss:// without query parameters or fragments.");
  }

  const port = Number(url.port || 6379);
  const databasePath = url.pathname.replace(/^\/+/, "");
  const database = databasePath === "" ? undefined : Number(databasePath);
  if (
    !url.hostname ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (databasePath !== "" && (!/^\d+$/.test(databasePath) || !Number.isSafeInteger(database) || database < 0))
  ) {
    throw redisConfigurationError("REDIS_URL contains an invalid host, port, or database number.");
  }

  let username;
  let password;
  try {
    username = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } catch (error) {
    throw redisConfigurationError("REDIS_URL contains invalid encoded credentials.", error);
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

module.exports = { redisConnection };
