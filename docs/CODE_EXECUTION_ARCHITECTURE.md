# Code Execution Architecture

## Release 1 decision

Use Judge0 through a dedicated backend adapter and BullMQ worker boundary.
Express validates and persists submissions but never executes student code.
A future self-hosted isolated worker can replace Judge0 behind the same
`CodeExecutionProvider` contract.

## Frontend submission flow

1. Monaco editor keeps source in local React state and optional server draft.
2. The client sends problem ID, language, source, mode, optional custom input,
   and a cryptographically random idempotency key.
3. The server returns `202 Accepted` with submission ID and `QUEUED` status.
4. The client polls an authorized status endpoint; SSE/Socket.IO may be added
   later for status events.
5. The client receives bounded public result summaries only.

The browser never receives hidden test input/output, Judge0 credentials,
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

## Judge0 adapter and test evaluation

The adapter translates an internal `ExecutionRequest` into Judge0 requests:
language ID, source, stdin, expected output policy, CPU/time/memory/output
limits, and network policy. It polls with bounded timeout and maps provider
responses into an internal response.

The platform evaluation layer, not the browser, compares output:

1. load public/hidden test references from protected storage;
2. submit each test with a normalized comparison policy;
3. normalize only approved line endings/trailing whitespace;
4. never ignore meaningful tokens or use fuzzy comparison unless the problem
   explicitly declares it;
5. persist per-test pass/fail without exposing hidden input/output;
6. derive the first authoritative verdict using the platform mapping.

Hidden tests remain server/provider-side and are never serialized into API
responses, browser bundles, logs, analytics, or error messages.

## Language and policy configuration

Each language has a server-owned configuration: platform language ID, compiler/
runtime image or Judge0 ID, starter format, allowed file type, source-size
limit, CPU limit, wall-clock limit, memory limit, process limit, output limit,
network policy, and enabled modes. Release 1 may enable Java first; adding a
language requires a reviewed adapter/configuration and tests.

Proposed engineering defaults require approval and load testing:

- CPU: 2 seconds per test;
- wall clock: 5 seconds per test and 60 seconds queue wait;
- memory: 256 MB per execution;
- processes/threads: provider policy, with a bounded platform limit;
- output: 1 MB per test and 10 MB aggregate;
- source: 100 KB;
- custom input: 20 KB.

These are platform limits, not legal or provider guarantees.

## Isolation and external Judge0 considerations

Judge0 is an external processor of submitted source, stdin, and execution
results. The deployment must confirm provider terms, region, retention,
subprocessor/security posture, transport encryption, credential scope, and
whether source is retained or used for training. Do not send resumes, identity
data, or unrelated profile data. Use a short-lived/provider-scoped credential
where supported and document the data-processing decision before production.

Judge0 must disable network access where supported. The platform never trusts
provider isolation blindly: a self-hosted replacement must use pinned patched
images, no network namespace, isolated filesystem, dropped privileges,
resource/process limits, and cleanup. The current local Java runner remains
development-only and is not an acceptable shared sandbox.

## Failure handling and verdicts

Student-code failures are `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`,
`TIME_LIMIT_EXCEEDED`, or `MEMORY_LIMIT_EXCEEDED`. Infrastructure/provider
failures are `INTERNAL_ERROR`/`FAILED`, are never represented as a student
failure, and do not consume an attempt when policy says the platform did not
execute.

Transient provider/network failures retry with bounded exponential backoff and
dead-letter after the configured attempts. Compilation/runtime verdicts do not
retry. Cancellation is best-effort and recorded. A worker crash is recovered by
lease timeout/reconciliation, not by blindly re-running a completed row.

## Persistence, history, and analytics

`CodeSubmission` stores immutable source hash, ownership, problem, language,
mode, assignment, idempotency key, lifecycle state, verdict, timestamps,
attempt count, and policy version. `ExecutionResult` stores provider request
ID, bounded output/error, resource use, per-test summary, and failure code.
Hidden test content is not stored in these user-visible records.

Submission history is an authorized paginated query. After a successful
transaction, an outbox event updates coding analytics asynchronously and
idempotently by submission ID. Analytics failures never alter the authoritative
verdict.

