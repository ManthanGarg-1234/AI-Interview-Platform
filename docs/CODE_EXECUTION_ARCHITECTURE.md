# Coding Judge Architecture

## Release 1 decision

Use Judge0 through a dedicated backend adapter. Express validates and persists
submissions but never executes student code. A future self-hosted isolated
worker can replace Judge0 behind the same adapter contract.

## Submission lifecycle

```text
RECEIVED -> VALIDATED -> QUEUED -> DISPATCHED -> RUNNING
  -> COMPLETED (verdict) | FAILED (provider/internal)
  -> EXPIRED/CANCELLED where applicable
```

1. Authenticate the user and resolve practice/contest/recruiter assignment.
2. Validate problem, language, source size, mode, idempotency key, and attempt.
3. Persist submission with immutable source hash and `QUEUED` status.
4. Enqueue a job containing only submission ID and execution policy ID.
5. Worker loads protected tests and submits through the Judge0 adapter.
6. Poll or receive the provider result with bounded timeout and retry policy.
7. Persist per-test result summary, verdict, resource use, and provider metadata.
8. Publish status through polling/SSE-compatible endpoint.
9. Emit analytics/audit events without exposing hidden tests.

## Adapter contract

```text
execute(ExecutionRequest): Promise<ExecutionResponse>
```

The request includes language ID, source reference, stdin/test reference,
expected-output comparison policy, CPU/time/memory/output limits, and network
policy. The response includes provider status, verdict, execution time, memory,
bounded stdout/stderr/compile output, and a provider request ID.

The adapter maps Judge0 statuses to platform verdicts:
Accepted, Wrong Answer, Compilation Error, Runtime Error, Time Limit Exceeded,
Memory Limit Exceeded, or Internal Error.

## Protection and limits

- Hidden tests are server-side/provider-side and never sent to the browser.
- The client receives only public tests and bounded result summaries.
- Source length, stdin length, output length, file count, CPU, memory, wall-clock,
  queue wait, and submission frequency are policy-controlled.
- Network access is disabled by the Judge0 policy where supported.
- Judge0 credentials are backend-only.
- Submission source is encrypted at rest where supported and redacted from logs.
- Idempotency keys prevent duplicate execution for retried requests.

## Queue and failure handling

BullMQ is the intended queue boundary. Jobs have bounded retries, exponential
backoff, timeout, and dead-letter handling. A provider outage marks the
submission `FAILED` with an explicit internal error and does not fabricate a
verdict. Cancellation is best-effort and recorded.

## Replacement path

The `CodeExecutionProvider` interface allows a self-hosted worker to replace
Judge0. The worker must provide stronger isolation than the current local Java
runner, including network namespace control, filesystem isolation, process
limits, image pinning, patching, and security monitoring.

