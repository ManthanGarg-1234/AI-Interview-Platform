# Migration Plan

## Goals

Migrate the existing HTML/CSS/vanilla JavaScript application to React + Vite +
Tailwind, Express, PostgreSQL, and Prisma while preserving useful behavior and
assets. Deliver working vertical slices, not static replacement pages.

## Strategy

Use an incremental strangler migration:

1. Keep the legacy pages runnable while the target workspace is established.
2. Freeze existing behavior with baseline tests and an inventory of routes,
   localStorage records, API responses, and critical workflows.
3. Create a React shell and shared design system that preserves existing branding.
4. Create an Express modular monolith and Prisma schema before replacing data
   consumers.
5. Migrate authentication and a minimum interconnected slice across all portals.
6. Migrate coding, assessments, text AI, study planner, recruiter, and admin
   slices in dependency order.
7. Verify each slice through API, component, integration, and browser tests.
8. Retire legacy pages only after approval and parity evidence.

## Migration boundaries

### Preserve/copy initially

- Existing HTML/CSS/JS and server code remain available in the backup branch.
- Existing labels, interview lifecycle, problem metadata, verdicts, and useful
  seed/reference data are retained as migration references.
- Existing coding API behavior remains a compatibility reference during the
  first coding slice.

### Rewrite

- Runtime persistence, authentication, authorization, routing, page rendering,
  forms, business services, admin/recruiter/student workflows, and security.
- Local Java execution is rewritten behind a queue/isolated execution boundary.
- AI and real-time modules are new implementations informed by existing UX.

### Defer cleanup

- Deleting legacy HTML and browser scripts.
- Removing the shared CSS file.
- Removing compatibility endpoints.
- Removing JSON fixtures.

These cleanup actions require successful parity tests and explicit approval.

## Ordered phases

### Phase 0: Baseline and foundation

- Run existing API tests and record environment prerequisites.
- Add frontend/backend workspace structure without deleting legacy files.
- Add `.env.example` sections, security headers, error format, logging, and
  development scripts.
- Set up Vite, Tailwind, React Router, API client, query client, form validation,
  and test tooling.

### Phase 1: Design system and application shell

- Convert CSS variables into Tailwind theme tokens.
- Build accessible primitives: button, field, select, modal, toast, card, table,
  loading, empty, error, pagination, avatar, breadcrumb, and confirmation.
- Build responsive public layout and shared authenticated shell.
- Add separate student, recruiter, and admin navigation configuration.
- Add theme persistence and reduced-motion behavior.

### Phase 2: Identity and authorization

- Prisma identity models and migrations.
- Registration, login, logout, email verification, recovery, refresh rotation,
  account status, and secure HTTP-only cookie/session handling.
- Server-side RBAC and resource ownership middleware.
- Protected routes and access-denied/404 behavior.
- Security and auth tests before portal work continues.

### Phase 3: Student profile and dashboard

- Student profile, education, skills, projects, experience, certifications.
- Dashboard metrics sourced from database queries.
- Profile completion and evidence definitions.
- Resume metadata and secure upload boundary.

### Phase 4: Coding platform

- Coding problems/topics/test cases/submissions/results schema.
- Monaco editor and multi-language model.
- Queue-backed JDoodle adapter; preserve the existing provider boundary and
  avoid introducing a local execution server.
- Server-enforced practice/contest/recruiter modes, limits, hidden tests,
  persistence, analytics, and submission history.

### Phase 5: Assessments and learning

- Question bank, assessments, assignments, attempts, autosave, scoring, results.
- Learning hierarchy, progress events, study planner, reminders, approvals, and
  recommendation records.

### Phase 6: AI services and interviews

- Central provider abstraction with server-only credentials and usage records.
- Persistent chatbot with authorized context and streaming support.
- Text AI interviewer, evaluation, feedback, and consent.
- Release 1 is text-only. Voice, WebRTC signaling, TURN, and media consent are
  Release 2.

### Phase 7: Recruiter portal

- Companies, verification, members, jobs, applications, stage history, notes,
  assessments, interview scheduling, candidate authorization, and decisions.

### Phase 8: Admin, security, and governance

- User/company/job/assessment/interview management.
- Security events, moderation cases, evidence, actions, appeals, audit logs, and
  platform analytics.

### Phase 9: Cross-portal integration and hardening

- Notifications, analytics, skill evidence, consent/data access logs, retention,
  backups, rate limits, load tests, accessibility, and deployment.
- Remove legacy pages only after acceptance review.

## Approval gates

- No substantial migration code should begin until this planning package is
  approved.
- Each phase needs API, database, UI, and test evidence.
- A feature is not complete when it only renders; its persistence, authorization,
  error/loading/empty states, and tests must pass.

## First implementation slice after approval

The first Release 1 slice must cross all portals: authenticated student profile
and discoverability, recruiter company/job publication, student application,
recruiter screening, and admin audit visibility. This proves the core
student-to-recruiter-to-admin data path before deeper feature modules.
