# Low-Level Design

## Proposed frontend route model

Public routes include `/`, `/features`, `/ai-interviews`, `/coding`,
`/resume-analyzer`, `/about`, `/contact`, `/faq`, `/login`, `/register`,
`/forgot-password`, `/privacy`, and `/terms`.

Protected routes use `/student/*`, `/recruiter/*`, and `/admin/*` as specified in
the master prompt. A route guard checks authenticated session and role, while
the API remains the authority for authorization.

## Shared frontend contracts

- `AuthProvider`: session bootstrap, login, logout, refresh, current user.
- `ApiClient`: base URL, credentials, request ID, JSON/error normalization.
- `QueryProvider`: caching, invalidation, retry policy, offline-safe UI state.
- `ProtectedRoute`: authentication and role gate; never a substitute for API RBAC.
- `AppShell`: sidebar, top navigation, breadcrumbs, notifications, theme,
  profile menu, mobile drawer.
- Form pattern: React Hook Form + Zod schema + field-level/server error mapping.

## Backend conventions

- All new routes are `/api/v1/<resource>`.
- Success responses use `{ data, meta? }`; failures use
  `{ error: { code, message, details? }, requestId }`.
- Collections accept `page`, `pageSize`, `sort`, `search`, and resource filters.
- Controllers validate input, call one service boundary, and map known errors.
- Services enforce ownership/RBAC and use Prisma transactions where a state
  transition changes more than one record.
- Repositories never trust client-provided user or company IDs.

## State and events

- Server state belongs in TanStack Query; local UI state belongs in React state.
- Drafts/autosave use debounced mutations and explicit conflict handling.
- Domain events/outbox records can feed notifications, analytics, and audit logs.
- Jobs are idempotent and include retry/backoff plus dead-letter handling.

## Coding execution

1. Validate user, mode, language, source size, problem, and attempt permission.
2. Persist `CodeSubmission` as queued with an idempotency key.
3. Enqueue isolated execution job.
4. Worker runs public/hidden tests with CPU, memory, process, network, and output
   limits in a sandbox/provider.
5. Persist `ExecutionResult` and verdict.
6. Publish status for polling or Socket.IO updates.
7. Update analytics asynchronously.

## Security-sensitive implementation details

- Prefer secure HTTP-only, SameSite cookies for refresh/session tokens.
- Hash passwords with bcrypt/Argon2-compatible policy; never log secrets.
- Validate all uploaded files by type, size, content, and malware policy.
- Build audit records from server-side actor/resource context.
- Redact resume, interview, AI, and assessment data from general logs.

## Approved transport decisions

- Authentication: secure HTTP-only cookies with CSRF protection for state-changing
  requests.
- AI text streaming: authenticated SSE.
- Future interview presence/signaling: Socket.IO, separate from AI message
  streaming.
- Code execution: BullMQ job boundary plus JDoodle REST adapter; no execution
  in the Express request process or locally in Node.js.
