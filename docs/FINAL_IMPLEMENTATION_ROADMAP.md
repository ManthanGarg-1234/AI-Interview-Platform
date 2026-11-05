# Final Implementation Roadmap

## Release 1 objective

Deliver one functional vertical slice across all three portals with real
authentication, PostgreSQL persistence, interconnected workflows, and tested
core features:

- authentication, sessions, RBAC, and navigation
- student profile, resume metadata, coding, assessments, AI chatbot, text AI
  interviewer, study planner, applications, and analytics foundation
- recruiter company/jobs/applications/candidate evaluation
- admin governance, audit, security events, moderation foundation, and platform
  operations

Voice/video and advanced analytics are Release 2.

## Stage 0: Architecture lock and local infrastructure

**Exit evidence:** approved contracts, PostgreSQL/Redis service design, environment
template, baseline test report, no production secrets.

- Approve this design package.
- Select Node LTS baseline for development/CI.
- Configure PostgreSQL and Redis through local or managed services; Docker is
  optional and not required for coding execution.
- Keep all legacy files intact.

## Stage 1: Workspace and design system

**Exit evidence:** React/Vite app starts, shared components are tested, all
portal shells render responsively, legacy pages remain runnable.

- Add frontend workspace and Tailwind tokens.
- Build public, student, recruiter, and admin layouts.
- Implement theme, motion/reduced-motion, loading/error/empty states, and route
  handling.

## Stage 2: Prisma foundation and identity

**Exit evidence:** validated Prisma schema, local migration in development
environment, auth integration tests, RBAC matrix tests.

- Implement field-level schema from `FINAL_PRISMA_SCHEMA.md`.
- Add seed policy without demo passwords in production paths.
- Implement registration, verification, login, refresh rotation, logout,
  recovery, suspension, session management, CSRF, and audit events.

## Stage 3: Interconnected portal slice

**Exit evidence:** E2E test from student registration through recruiter
application review and admin audit.

- Student profile and discoverability/consent.
- Recruiter company verification and job publishing.
- Student application submission with resume/consent snapshot.
- Recruiter screening and stage transition.
- Admin read-only audit visibility.
- Notifications for each committed workflow event.

## Stage 4: Coding and assessments

**Exit evidence:** Monaco flow, JDoodle adapter/credit tests, Java-only API
validation, hidden-test protection, and assessment autosave/timeout/grading tests.

- Coding problems, topics, submissions, execution results, and history.
- JDoodle REST adapter through the existing BullMQ queue boundary.
- Assessment bank, assignments, attempts, answers, scoring, and reports.

## Stage 5: AI and interview

**Exit evidence:** provider adapter contract tests, budget/rate-limit tests,
authorized-context tests, text interview E2E.

- Central AI provider abstraction and prompt versioning.
- Persistent chatbot with SSE.
- Text AI interviewer and rubric evaluation.
- Resume analyzer/profile enhancer with student approval.

## Stage 6: Study planner and analytics

**Exit evidence:** formula tests, insufficient-data behavior, recommendation
approval tests, recruiter/admin aggregate authorization tests.

- Learning taxonomy and progress.
- Study goals/tasks/recommendations.
- Versioned metric formulas and analytics facts/snapshots.
- Skill evidence states and dashboard integration.

## Stage 7: Governance and hardening

**Exit evidence:** moderation/security E2E, access-control audit, backup restore,
dependency/security scan, focused and full test reports.

- Security monitoring and moderation workflow.
- Appeals, evidence, audit protection, data access logs.
- Retention/deletion jobs and consent management.
- Performance/load tests and a deployment path that does not require Docker.

## Stage 8: Release 2

- WebRTC signaling and TURN.
- Voice AI with speech-to-text/text-to-speech.
- Consent-based recordings.
- Advanced analytics and recommendation improvements.
- Additional execution providers only through a separately approved adapter change.

## Definition of done for every feature

Frontend, API, database persistence, validation, authorization, loading/empty/
error/success states, audit/consent where relevant, focused tests, integration
tests, documentation, manual configuration, and known limitations must all be
reported. No placeholder button or fake provider integration is acceptable.
