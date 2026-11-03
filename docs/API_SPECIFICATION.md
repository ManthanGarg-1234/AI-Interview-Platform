# API Specification

## Conventions

Base path: `/api/v1`. Authentication uses secure session/refresh cookies or an
approved equivalent. All protected endpoints enforce server-side RBAC,
ownership/consent checks, validation, pagination, rate limits, and normalized
errors.

## Initial resource surface

| Module | Endpoints (planned) | Roles |
|---|---|---|
| Auth | `POST /auth/register`, `/login`, `/logout`, `/refresh`, `/verify-email`, `/forgot-password`, `/reset-password`, `GET /auth/me` | Public/current user |
| Students | `GET/PATCH /students/me`, profile subresources, dashboard, analytics | Student |
| Recruiters | `GET/PATCH /recruiters/me`, dashboard | Recruiter |
| Companies | company CRUD, members, verification | Recruiter/Admin |
| Jobs | list/detail, create/update/publish/pause/close | Public/Recruiter/Admin |
| Applications | apply, list, detail, stage transitions, notes, decisions | Student/Recruiter/Admin |
| Coding | problems, submissions, execution result, history | Student/Recruiter/Admin |
| Assessments | catalogue, create, assign, attempt, autosave, submit, results | All by role |
| Interviews | configure, schedule, join, questions, answers, evaluation | Student/Recruiter/Admin |
| Learning | subjects/topics/resources/progress/activity | Student/Admin |
| Planner | plans/goals/tasks/recommendations/completions | Student |
| Resumes | upload, versions, analyze, suggestions, approval | Student |
| AI | conversations/messages/stream, interview evaluation, usage | Student/Admin |
| Analytics | student, recruiter, admin dashboards and trends | Role-scoped |
| Notifications | list/read/preferences | Current user |
| Admin/Security | users, moderation, events, audit, settings | Admin |

## Existing compatibility API

The current unversioned endpoints remain a migration reference:

- `GET /api/health`
- `GET /api/problems`
- `GET /api/problems/:id`
- `POST /api/submissions/run`
- `POST /api/submissions/submit`
- `GET /api/submissions/:id`
- `GET /api/users/me/submissions`

They currently use `x-demo-user-id`, JSON-file persistence, and Java-only
execution. They must not be treated as production authentication or a final
contract.

## Endpoint contract requirements

Each final endpoint specification must document HTTP method/path, auth and role,
request schema, response schema, validation rules, ownership/consent rules,
status/error codes, pagination/filtering, rate limit, audit/event behavior, and
idempotency requirements where applicable.

## Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": []
  },
  "requestId": "server-generated-id"
}
```

## Open contract decisions

- Cookie versus bearer access-token transport must be confirmed before auth
  implementation; secure HTTP-only cookies are the recommended default.
- Final AI streaming transport (SSE versus Socket.IO) must be selected with the
  provider and deployment constraints.
- Final code execution provider and supported languages require infrastructure
  approval.
