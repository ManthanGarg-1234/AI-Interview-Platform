# Code Execution Architecture

## Release 1 decision

Use the JDoodle Compiler REST API through a dedicated backend adapter and the
existing BullMQ worker boundary. Express validates and persists submissions
but never executes student code. No local execution server, VM, Docker runtime,
or Judge0 dependency is part of this design.

## Frontend submission flow

1. Monaco editor keeps source in React state.
2. The client sends problem ID, language, source, mode, optional custom input,
   and a cryptographically random idempotency key.
3. The server returns `202 Accepted` with submission ID and `QUEUED` status.
4. The client polls an authorized status endpoint; SSE/Socket.IO may be added
   later for status events.
5. The client receives bounded public result summaries only.

The browser never receives hidden test input/output, JDoodle credentials,
execution policy internals that would weaken protection, or another user's
submission.

## Express submission API

`POST /api/v1/coding/submissions` authenticates the session, checks problem
publication, language, mode, assignment/application scope, attempt limits,
source/input sizes, idempotency, and user suspension. It creates a database row
and an outbox/queue request in one transaction. The response is `202` for
accepted queueing, `409` for an idempotency conflict with different content,
`422` for student validation, and `503` only when queue infrastructure cannot
accept work.

`GET /api/v1/coding/submissions/:id` and the history endpoint enforce ownership
or the explicitly assigned recruiter/admin scope.

## Queue and atomic lifecycle

```text
RECEIVED -> VALIDATED -> QUEUED -> DISPATCHED -> RUNNING
  -> COMPLETED (student verdict)
  -> FAILED (infrastructure/provider)
  -> EXPIRED | CANCELLED
```

BullMQ carries only submission ID, execution policy ID, and a deduplication
token. The worker claims a row with an atomic conditional update:
`UPDATE ... WHERE status = QUEUED`, recording `attemptCount`, `workerId`, and
`startedAt`. A second worker cannot claim the same row. The database unique
constraint `(userId, idempotencyKey)` prevents duplicate logical submissions;
the queue job ID is the submission ID and duplicate enqueue attempts are safe.

State transitions validate the previous state, write the new state and audit
event transactionally, and use optimistic version/updated-at checks. A stale
worker cannot overwrite a completed/cancelled row.

## JDoodle adapter and test evaluation

The adapter sends `clientId`, `clientSecret`, Java `script`, `stdin`, and the
configured Java `versionIndex` to `POST https://api.jdoodle.com/v1/execute`.
The worker first makes one `compileOnly` request per source; a failed
`compilationStatus` ends evaluation before paid test executions. A successful
compile is followed by one paid REST execution per test input. The adapter
normalizes output, CPU time, memory, compilation failures, runtime failures,
timeouts, and provider errors into the existing result contract. JDoodle REST
does not accept the platform's per-problem CPU/memory limits, so the existing
database fields do not enforce those limits at the provider.

The platform evaluation layer, not the browser, compares output:

1. load public/hidden test references from protected storage;
2. submit each needed test with a normalized comparison policy;
3. normalize only approved line endings/trailing whitespace;
4. never ignore meaningful tokens or use fuzzy comparison unless the problem
   explicitly declares it;
5. persist per-test pass/fail without exposing hidden input/output;
6. derive the first authoritative verdict using the platform mapping.

Hidden tests remain in protected server storage and are never serialized into API
responses, browser bundles, logs, analytics, or error messages.

## Language and policy configuration

Problem language configurations remain stored for future use, but this release
allows only Java at the coding and contest API boundary. JDoodle Java is pinned
to version index `5` (JDK 21.0.0 in the official version list). Adding another
language requires a reviewed provider mapping and tests.

Proposed engineering defaults require approval and load testing:

- CPU: 2 seconds per test;
- wall clock: 5 seconds per test and 60 seconds queue wait;
- memory: 256 MB per execution;
- processes/threads: provider policy, with a bounded platform limit;
- output: 1 MB per test and 10 MB aggregate;
- source: 100 KB;
- custom input: 20 KB.

These are platform limits, not legal or provider guarantees.

## Isolation, provider data, and credits

JDoodle is an external processor of submitted source, stdin, and execution
results. Confirm provider terms, region, retention, subprocessors/security,
transport encryption, credential scope, and source-code use before production.
Do not send resumes, identity data, or unrelated profile data. Client ID and
secret remain server-side.

JDoodle documents isolated execution with no route to the network by default.
Verify this against the account plan and current provider terms. Each execution
request consumes one credit; `credit-spent` is free and cached for a bounded
interval. The free Compiler API plan lists 20 daily credits, resetting at
23:55 UTC. Worker concurrency defaults to one. Do not retry HTTP 429 or an
ambiguous execution timeout, since the provider may already have run the code.

## Failure handling and verdicts

Student-code failures are `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`,
`TIME_LIMIT_EXCEEDED`, or `MEMORY_LIMIT_EXCEEDED`. Infrastructure/provider
failures are `INTERNAL_ERROR`/`FAILED`, are never represented as a student
failure, and do not consume an attempt when policy says the platform did not
execute.

Provider failures are infrastructure errors, never student verdicts. HTTP 401
indicates credentials are rejected; HTTP 429 indicates daily credit exhaustion.
Do not automatically retry those responses or network timeouts. Compilation
errors are determined through JDoodle's documented `compileOnly` status;
runtime and timeout output is normalized separately. BullMQ retains bounded
retry behavior for non-provider job failures, while completed test summaries
prevent repeating already completed cases.

## Persistence, history, and analytics

`CodeSubmission` stores immutable source hash, ownership, problem, language,
mode, assignment, idempotency key, lifecycle state, verdict, timestamps,
attempt count, and policy version. `ExecutionResult` stores provider name,
bounded output/error, resource use, per-test summary, and failure code.
Hidden test content is not stored in these user-visible records.

Submission history is an authorized paginated query. After a successful
transaction, an outbox event updates coding analytics asynchronously and
idempotently by submission ID. Analytics failures never alter the authoritative
verdict.
