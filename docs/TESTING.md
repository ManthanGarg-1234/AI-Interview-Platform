# Testing Strategy

## Baseline

The existing server uses Node's built-in `node:test` and tests health,
problem-redaction, auth rejection, local Java acceptance, compilation errors,
and wrong answers. Run `npm test` before modifying the coding API and retain the
baseline result.

## Target test layers

### Frontend

- Vitest and React Testing Library for primitives, forms, loading/empty/error
  states, permissions, theme, sidebars, and page behavior.
- Router tests for public, authenticated, role-protected, access-denied, and 404
  routes.
- Query/mutation tests for cache invalidation and server errors.

### Backend

- Unit tests for validation, services, scoring, authorization, transitions,
  provider adapters, and job idempotency.
- Supertest integration tests against a test PostgreSQL database for auth,
  ownership, recruiter workflows, assessment submission, coding records,
  notifications, audit, and moderation.
- Prisma migration/seed tests and transaction rollback tests.

### Browser E2E

Playwright workflows: registration/verification, login/logout/recovery, profile,
resume analysis, coding execution, assessment completion, AI interview, planner,
job publishing/application/shortlisting, recruiter interview, admin moderation,
mobile navigation, and access denial.

### Security and resilience

Test invalid tokens, role escalation, IDOR, malicious input/uploads, rate limits,
CSRF, XSS, prompt/context isolation, code execution limits, queue retries,
provider failures, consent, deletion, and backup restore.

### Performance

Load test the stated capacity assumptions, with explicit measurements for API
latency, database pool saturation, queue latency, AI concurrency, and coding
submissions. Do not claim targets without measured evidence.

## Quality gates

Each phase requires passing focused tests, no known high-severity security
regressions, documented manual configuration, and updated
`IMPLEMENTATION_STATUS.md`. Full E2E and load suites run before production
release, not as a substitute for focused tests during development.
