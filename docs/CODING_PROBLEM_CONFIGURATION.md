# Coding problem configuration

Coding problem configuration and test-case management are administrator-only under `/api/v1/admin/coding`. Requests use the existing authentication and CSRF protections.

## Configure execution mode

`PUT /problems/:problemId/configuration` accepts an execution mode, language configurations, and—when using `FUNCTION_BASED`—a function name, optional class name, parameter definitions, return type, and input/output serialization formats. Supported languages are C, C++, Java, Python, and JavaScript.

Each enabled function-based language must provide a function signature and a trusted harness template containing exactly one `{{USER_CODE}}` placeholder. A function harness must read the configured serialized argument value from stdin, invoke the configured function/class, and write exactly the configured serialized return value to stdout. The backend serializes JSON and JSON-lines inputs and validates structured JSON output; the language harness is responsible for language-specific invocation and stdin/stdout glue. The backend never infers a harness from a signature. Templates are administrator-managed and are never accepted from a student's Run request.

Problems with no execution mode remain `STDIN_STDOUT`. Student-facing problem details expose the mode and function metadata, but never the harness template.

## Manage test cases

- `GET /problems/:problemId/test-cases` lists test-case input and expected output for administrators.
- `POST /problems/:problemId/test-cases` creates a test case.
- `PATCH /test-cases/:testCaseId` updates supplied fields.

Test cases support `PUBLIC` or `HIDDEN` visibility, execution sequence, enabled state, positive weight, and comparison configuration (`TRIM_TRAILING_WHITESPACE`, `EXACT`, or `FLOAT_TOLERANCE`). Input and expected output are stored using private-storage references, not in the database row or student responses. Each value is limited to 50,000 characters.

Hidden test-case inputs and expected outputs are not returned by student APIs. The Run API uses public enabled cases and enforces each case's comparison policy.

## Submit evaluation

`POST /coding/submissions` creates a persistent, idempotent submission and queues it on the existing coding worker. Submit evaluates every enabled public and hidden test case sequentially with the problem's CPU/memory limits, comparison policy, and trusted language harness. An incomplete function harness is rejected before queueing. Infrastructure failures are reported as `SYSTEM_ERROR`; they are never converted to `WRONG_ANSWER`.

The persisted test summary includes only case sequence, visibility, pass/fail verdict, execution time, and memory. Actual output and diagnostics are retained only for public cases. Hidden inputs, expected outputs, private-storage references, and hidden execution output are excluded from student APIs. `GET /coding/submissions/:id` checks ownership; `GET /coding/submissions?problemId=...&pageSize=1` supports restoring the latest result when a student reopens a problem.

Scores are integer percentages based on passing test-case weights, rounded to the nearest integer. Acceptance requires every enabled case to pass; problems with no enabled cases fail safely as `SYSTEM_ERROR`. Verdict precedence when multiple case outcomes differ is `SYSTEM_ERROR`, `COMPILATION_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, `RUNTIME_ERROR`, `WRONG_ANSWER`, then `ACCEPTED`.

Submission states include `QUEUED`, `PROCESSING`, and `EVALUATING`; terminal status is the final verdict (`ACCEPTED`, `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, or `SYSTEM_ERROR`). Queue and worker failures are stored as `SYSTEM_ERROR`. A repeated request with the same idempotency key and payload returns the original submission; reusing the key for different code or a different problem/language is rejected.
