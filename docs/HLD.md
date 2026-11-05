# High-Level Design

## Architecture

```text
Browser
  React/Vite SPA + Tailwind + Router + Query
       |
       | HTTPS REST / WebSocket
       v
Express modular monolith
  auth | users | students | recruiters | companies | jobs | applications
  interviews | assessments | coding | learning | planner | resumes | ai
  analytics | skills | integrity | moderation | notifications | audit | admin
       |
       +--> Prisma --> PostgreSQL
       +--> Redis --> BullMQ workers
       +--> Object storage (resumes and consented media)
       +--> AI provider abstraction
       +--> Isolated code execution provider/worker
       +--> WebRTC signaling and TURN (later)
```

## Frontend layers

- `app`: router, providers, auth/session bootstrap, error boundary.
- `layouts`: public, student, recruiter, admin, mobile navigation.
- `pages`: route-level composition and data loading.
- `components`: reusable design-system and domain components.
- `features`: vertical feature modules with forms, queries, mutations, and views.
- `lib`: API client, validation, formatting, permissions, telemetry.

## Backend layers

- `routes`: versioned HTTP contracts and middleware composition.
- `controllers`: request/response orchestration only.
- `services`: business rules and transaction boundaries.
- `repositories`: Prisma access and query composition.
- `schemas`: Zod request/response validation.
- `jobs`: BullMQ producers/workers for AI, notifications, analytics, execution.
- `integrations`: AI, email, object storage, JDoodle, WebRTC support.
- `middleware`: auth, RBAC, rate limit, errors, request IDs, security.

## Deployment topology

Development may use Docker Compose for PostgreSQL and Redis. Production should
separate the web/API process, workers, PostgreSQL, Redis, object storage, and
isolated execution infrastructure. Secrets must be injected through the
deployment environment and never shipped to the browser.

## Runtime principles

- API is stateless except for database/Redis-backed sessions and jobs.
- Long-running AI, email, analytics, and code execution work is asynchronous.
- Database transactions protect application stage transitions, scoring, and
  sensitive administrative actions.
- All cross-portal reads are constrained by role, ownership, consent, and
  organization membership.

## Approved Release 1 decisions

- Secure HTTP-only cookies with short-lived access tokens and rotated refresh
  tokens.
- External LLM through a backend provider abstraction; keys/configuration and
  cost controls remain server-side.
- JDoodle through the existing BullMQ coding worker and dedicated adapter;
  Java is enabled first and submitted code is not executed locally.
- Text AI interviews in Release 1; voice/WebRTC video in Release 2.
- PostgreSQL and Redis may be supplied by local services or managed hosting;
  Docker is not required for code execution or development.
