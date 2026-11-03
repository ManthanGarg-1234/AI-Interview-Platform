# Final Architecture Approval

## Status

The approved direction is documented and the implementation remains paused.
This review changed documentation only. No application code, dependencies, or
database migrations were modified or created.

## Final architecture decisions

1. **Frontend**: React, Vite, JavaScript, Tailwind CSS, React Router, Axios,
   TanStack Query, React Hook Form, Zod, Motion, Recharts, Lucide, and Monaco.
2. **Backend**: Node.js and Express modular monolith with versioned REST APIs,
   Socket.IO reserved for future real-time interview signaling.
3. **Authentication**: secure HTTP-only cookies, short-lived access tokens,
   refresh-token rotation, server-side sessions, revocation, and CSRF protection.
4. **Authorization**: deny-by-default platform RBAC plus company membership,
   ownership, assignment, consent, and state-transition checks.
5. **Database**: PostgreSQL and Prisma. The executable schema contract is in
   [FINAL_PRISMA_SCHEMA.md](./FINAL_PRISMA_SCHEMA.md); migrations are not yet
   created.
6. **AI**: four separate feature services behind a backend-only provider
   gateway, secret-manager references, prompt versioning, bounded context,
   SSE streaming, usage/cost reconciliation, and advisory-only output.
7. **Coding**: Judge0 through a BullMQ/dedicated adapter boundary. Express never
   executes untrusted code. A self-hosted isolated worker can replace Judge0.
8. **Interviews**: text AI interviews in Release 1; voice, WebRTC, TURN, and
   recordings are Release 2.
9. **Development**: Docker-first local PostgreSQL/Redis, then a cloud deployment
   plan.
10. **Release 1**: an interconnected vertical slice across student, recruiter,
    and admin portals, including auth, profile, coding, assessments, chatbot,
    text interviewer, planner, jobs, applications, evaluation, and governance.

## Resolved issues

- RBAC roles and company permissions are now explicit.
- Company verification submission is separated from admin review/approval.
- Student discoverability and recruiter visibility are consent-scoped.
- Admin privileged access and audit requirements are defined.
- Suspensions revoke sessions and refresh-token families.
- AI services, message ownership, prompt roles, injection controls, streaming
  recovery, retries, cost reconciliation, and advisory constraints are defined.
- Judge0 flow, queue lifecycle, hidden-test protection, comparison layer,
  limits, idempotency, duplicate prevention, failure classes, and persistence
  are defined.
- Prisma relations, refresh-token self-relation, resume/application links,
  membership lifecycle, owner protection, reapplication numbering, assessment
  relations, submission state defaults, AI secret references, audit immutability,
  readiness calculation ownership, file lifecycle, consent, and retention
  references are defined.

## Remaining technical risks

- Judge0 isolation, data processing, retention, region, and availability must be
  verified against the selected account/plan before production.
- External LLM output quality, prompt injection resistance, provider outages,
  cost variance, and privacy controls require adversarial testing.
- The Prisma schema must pass `prisma validate` and a development migration
  dry-run once Prisma is installed; this review intentionally did not install it.
- PostgreSQL/Redis capacity, queue backpressure, SSE connection behavior, and
  analytics throughput require load testing.
- Resume parsing and malware scanning require selected providers/engines and
  failure-path tests.
- Browser-to-React behavior parity may expose undocumented legacy localStorage
  edge cases during migration.

## Unresolved issues requiring approval

1. Product/legal approval of proposed retention defaults in
   [DATA_RETENTION_POLICY.md](./DATA_RETENTION_POLICY.md), or replacement
   jurisdiction-specific values.
2. Actual LLM provider, model aliases, secret manager, budget, and region.
3. Judge0 endpoint/plan, region, credentials, and data-processing acceptance.
4. Email provider and verified sender/domain.
5. Object-storage provider, bucket policy, malware-scanning service, and region.
6. Cloud deployment provider, observability, backups, and secret management.
7. Docker Desktop installation/approval on the development machine.
8. Node.js LTS baseline for CI and deployment.
9. Acceptance criteria and measurable quality gates for the first three-portal
   vertical slice.

## Migration readiness checklist

- [x] Master specification and existing repository inspected.
- [x] Git baseline and backup branch created.
- [x] Existing project audit and migration plan created.
- [x] HLD, LLD, SRS, ERD, API, security, and testing plans created.
- [x] RBAC and cross-portal data access contracts created.
- [x] AI architecture and code execution architecture created.
- [x] Workflow transitions and analytics formulas documented.
- [x] Field-level executable Prisma schema contract created.
- [x] Retention, consent, deletion, and file lifecycle documented.
- [x] No application code modified in this design phase.
- [x] No dependencies installed in this design phase.
- [x] No database migrations created.
- [ ] Approve retention/legal defaults.
- [ ] Provide/select external service accounts and credentials.
- [ ] Install/approve Docker-based local infrastructure.
- [ ] Approve final schema after `prisma validate` in the next preparation phase.
- [ ] Approve start of dependency setup and migration implementation.

## Cross-document consistency

This approval document was cross-checked against:

- [PROJECT_MASTER_PROMPT.md](../PROJECT_MASTER_PROMPT.md)
- [FINAL_ARCHITECTURE_REVIEW.md](./FINAL_ARCHITECTURE_REVIEW.md)
- [FINAL_RBAC_MATRIX.md](./FINAL_RBAC_MATRIX.md)
- [DATA_ACCESS_POLICY.md](./DATA_ACCESS_POLICY.md)
- [FINAL_PRISMA_SCHEMA.md](./FINAL_PRISMA_SCHEMA.md)
- [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)
- [CODE_EXECUTION_ARCHITECTURE.md](./CODE_EXECUTION_ARCHITECTURE.md)
- [WORKFLOW_STATE_TRANSITIONS.md](./WORKFLOW_STATE_TRANSITIONS.md)
- [ANALYTICS_METRICS.md](./ANALYTICS_METRICS.md)
- [DATA_RETENTION_POLICY.md](./DATA_RETENTION_POLICY.md)

The documentation is ready for final user approval. Implementation remains
blocked until the unresolved external/configuration decisions are confirmed.
