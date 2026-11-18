# Recruiter Portal Audit

## Existing recruiter architecture

- Frontend: React 19, Vite, React Router, TanStack Query, Recharts, Tailwind CSS.
- Backend: Express 5 with JWT/opaque sessions, Prisma, PostgreSQL, Redis, Socket.IO, and WebRTC signaling.
- Recruiter routes are mounted at `/api/v1/recruiter` and protected by recruiter authentication.
- Recruiter pages are under `frontend/src/pages/Recruiter*Page.jsx`.
- The existing portal already includes recruiter dashboards, jobs, applications, candidates, assessments, interviews, live interview rooms, interview scorecards, notifications, and job/student integration.

## Existing database entities

- `Company`, `CompanyMember`, `CompanyVerification`
- `Job`, `JobSkill`, `JobBookmark`, `Application`, `ApplicationStageHistory`
- `RecruiterNote`, `Assessment`, `AssessmentAssignment`, `AssessmentAttempt`
- `RecruiterInterview`, interview rounds, participants, scorecards, reschedule requests, live rooms
- `Notification`, `AuditLog`
- New recruiter foundation entities: `Offer` and application `internalTags`

## Implemented in this phase

- Company profile editing and team membership management.
- Job creation, duplication, publish/pause/close lifecycle.
- Recruiter application search and Kanban-style pipeline.
- Application details, private notes, internal tags, and comparison API.
- Database-backed recruiter dashboard KPIs and analytics aggregates.
- Assessment creation and publish/deactivate controls.
- Interview scheduling UI.
- Offer creation, send, withdraw, expire, hire, and student response APIs.
- Candidate discovery filters for name/headline, location, and skill.

## Remaining acceptance dependencies

- Publish and assign assessments requires recruiter-selected question/coding content.
- Human interview calendar and scorecard UI need further product-level completion.
- Company invite flow accepts existing active recruiter accounts; email invitation for unregistered users requires a dedicated invitation model and email workflow.
- AI interview configuration remains an existing shared AI interview feature rather than a recruiter-specific scheduling screen.
- Recording, TURN credentials, and external media infrastructure require deployment configuration.
