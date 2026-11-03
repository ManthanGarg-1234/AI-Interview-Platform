# Software Requirements Specification

## Product scope

CareerPrepAI is a full-stack platform for student learning and placement
preparation, recruiter hiring workflows, and administrative governance.

## Actors

- Student: learns, practices, completes assessments/interviews, manages profile,
  applies to jobs, and controls consent.
- Recruiter: manages a verified company, jobs, applications, interviews, and
  hiring decisions within authorized candidate data.
- Admin: governs users, companies, content, security, moderation, and platform
  settings.
- System worker: processes AI, notifications, analytics, and code execution jobs.

## Functional requirements

### Identity

- Support student and recruiter registration, login/logout, verification,
  recovery, reset, refresh rotation, suspension, and protected sessions.
- Admin accounts are provisioned; public admin signup is prohibited.
- Enforce RBAC and resource-level authorization on the server.

### Student

- Manage personal, education, skills, projects, experience, certifications,
  resume, preferences, applications, notifications, and consent.
- View database-backed dashboard metrics and transparent analytics.
- Complete coding, assessments, assignments, AI interviews, and learning plans.
- Use a persistent AI assistant with authorized context only.

### Coding

- Browse searchable, filterable problems and topics.
- Edit supported languages in Monaco, run samples, submit hidden tests, and view
  persisted verdicts, resource use, and history.
- Enforce practice, contest, and recruiter assessment restrictions server-side.
- Never execute untrusted code in the Express process.

### Recruiter

- Register/verify company, manage members, create/publish/pause/close jobs,
  discover authorized candidates, manage applications, assign assessments,
  schedule interviews, evaluate, and record auditable decisions.

### Admin

- Manage users, students, recruiters, companies, jobs, assessments, interviews,
  security events, moderation, audit logs, AI settings, analytics, and system
  settings.
- Treat AI misconduct flags as signals requiring human review.

### Cross-cutting

- Every operation has validation, authorization, loading/error/success feedback,
  auditability where sensitive, and automated tests.
- Support responsive light/dark UI, accessible navigation, reduced motion, and
  mobile drawers.

## Non-functional requirements

- PostgreSQL with Prisma, UUID identifiers, timestamps, foreign keys, indexes,
  and transactions.
- Versioned REST API under `/api/v1`; pagination for large collections.
- Secure cookies/tokens, password hashing, rate limits, secure headers, CORS,
  input/output validation, upload limits, consent, retention, and audit logs.
- Initial design target: 5,000 students, 200 recruiters, 100 companies, 10
  admins, 500 concurrent users, 50 AI interviews, 100 coding submissions/minute,
  and 200 assessment submissions/minute. These require load-test verification.

## Out of scope until explicitly scheduled

- Production voice/video and recording without consent.
- A proprietary code sandbox; use an isolated provider/worker.
- Unverified external claims, fabricated statistics, or fake integrations.
