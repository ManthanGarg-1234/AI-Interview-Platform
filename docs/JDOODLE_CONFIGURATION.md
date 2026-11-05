# JDoodle and coding worker configuration

Coding execution uses the existing Express API, BullMQ queue, Redis connection, and coding worker. The worker calls the JDoodle Compiler REST API; submitted code is never executed by Node.js. PostgreSQL/Prisma models and the React Monaco editor remain unchanged.

## Server environment

Set these only in the backend process environment or its secret manager. Do not put credentials in frontend variables, source control, logs, or API responses.

| Variable                      |  Default | Purpose                                                                                                                                                                                                      |
| ----------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JDOODLE_CLIENT_ID`           | required | JDoodle REST client ID.                                                                                                                                                                                      |
| `JDOODLE_CLIENT_SECRET`       | required | JDoodle REST client secret.                                                                                                                                                                                  |
| `JDOODLE_JAVA_VERSION_INDEX`  |      `5` | JDoodle Java version position. Index 5 is JDK 21.0.0 in the official [languages and versions reference](https://www.jdoodle.com/docs/api/languages); indices start at zero and are not Java version numbers. |
| `JDOODLE_REQUEST_TIMEOUT_MS`  |  `20000` | One REST request timeout, 500–60000 ms. A timeout is not retried because JDoodle may already have run the submitted program.                                                                                 |
| `JDOODLE_CREDIT_CACHE_TTL_MS` |  `60000` | Cache duration for free credit-spent reads, 10000–600000 ms.                                                                                                                                                 |
| `JDOODLE_DAILY_CREDIT_LIMIT`  |     `20` | Local admission limit, aligned with the free Compiler API allowance. Set to the actual plan allowance if it differs.                                                                                         |
| `JDOODLE_WORKER_CONCURRENCY`  |      `1` | Coding jobs per worker process, 1–20. Keep low to control usage and latency.                                                                                                                                 |

The root `.env.example` contains placeholders only. `.env` is ignored by Git. Keep the existing `REDIS_URL` configured for BullMQ; Docker is not required by the JDoodle integration.

## REST behavior

The adapter posts to `https://api.jdoodle.com/v1/execute` with `clientId`, `clientSecret`, `script`, `stdin`, `language: "java"`, and the configured `versionIndex`. The response `cpuTime` is seconds and is converted to milliseconds for `CodeRun`/`ExecutionResult`. The REST reference exposes `memory` but does not state its unit; the existing `memoryKb` field currently stores that numeric provider value as-is, so confirm the account/provider’s unit before presenting it as kilobytes.

Each source is checked with `compileOnly: true` before test execution. JDoodle documents `compilationStatus` as `0` for compiled and `1` for failed; this preflight is not a paid execution. A successful compile then costs one credit for each actual `execute` request/test input. Run and Submit preserve their existing workflows and result models.

The adapter distinguishes program compilation/runtime/timeout results from provider failures. HTTP 401 is a credential failure; HTTP 429 means daily credits are exhausted. Provider failures produce infrastructure/system errors, never `ACCEPTED` or `WRONG_ANSWER`. HTTP 429 and request timeouts are not retried to avoid duplicate paid execution.

The free `POST https://api.jdoodle.com/v1/credit-spent` call returns `{ "used": number }` and costs no execution credit. Usage is cached to avoid excess polling, displayed by the authenticated coding execution-health response, and reconciled with each accepted execution. JDoodle credits reset daily at 23:55 UTC. Treat the provider’s 429 response as authoritative if another process/account client consumes credits between checks.

## Verification

Automated tests mock JDoodle and do not verify real credentials or provider availability. A live smoke test is only appropriate when server credentials are already configured. Never print or return them. Before production, verify JDoodle terms, source-code handling/retention, account plan allowance, Java version availability, and provider resource limits. The documented REST request does not accept the platform’s per-problem CPU or memory limits, so those existing settings are not enforced by this adapter.
