# Existing Project Audit

## Scope and evidence

This audit records the repository as inspected on 2026-11-03. It is based on the
tracked source files, package manifests, server tests, and runtime checks. No
application code was migrated during this phase.

## Executive summary

The project is a browser-first CareerPrepAI prototype with:

- 21 user-facing HTML pages, plus the master specification and repository
  documentation.
- 1 shared CSS file (`css/style.css`, 44,410 bytes, approximately 2,235 lines).
- 22 browser JavaScript files under `js/` (approximately 4,297 lines).
- 7 server JavaScript files including tests under `server/`.
- A small Express 5 coding API with JSON-file submission persistence.
- Browser `localStorage` as the primary application database and demo session store.
- No production authentication, PostgreSQL, Prisma, Redis, queue, AI provider, or
  real multi-user authorization.
- Existing source size excluding `node_modules`: approximately 357,594 bytes.

The repository is valuable as a behavior and UI reference, but it is not yet a
full-stack implementation of the master specification.

## Repository inventory

### HTML pages

| File | Current purpose | Primary behavior |
|---|---|---|
| `index.html` | Demo login | Role selection, demo login, reset demo data |
| `signup.html` | Demo registration | Multi-step student/HR demo signup |
| `forgot-password.html` | Demo recovery | Simulated recovery form |
| `candidate.html` | Student dashboard | Interview launch, goals, jobs, applications, progress |
| `profile.html` | Profile | Student/recruiter profile editing |
| `account-settings.html` | Settings | Preferences, theme/session display |
| `prep.html` | Preparation center | Study activity and preparation content |
| `ai-interview.html` | AI interview studio | Deterministic text interview |
| `interview.html` | Live interview | Question navigation, answers, bookmarks, review |
| `result.html` | Interview result | Deterministic score and answer breakdown |
| `feedback.html` | Feedback center | Feedback and next-step guidance |
| `history.html` | Interview history | Search/sort historical records |
| `interviews.html` | Candidate interviews | Shared interview list |
| `lobby.html` | Interview lobby | Explicit microphone/device check |
| `recruiter.html` | Recruiter workspace | Demo jobs, applications, scheduling, pipeline |
| `interview-details.html` | Recruiter review | Candidate interview detail/review |
| `admin.html` | Admin dashboard | Metrics, records, audit trail |
| `coding.html` | Coding practice | Problem catalogue and API-backed Java execution |
| `leetcode.html` | LeetCode tracking | Profile link, goals, manual records |

### CSS and assets

- `css/style.css` is a large shared stylesheet with CSS variables, light/dark
  theme values, responsive media queries, cards, forms, tables, dashboards,
  interview UI, coding UI, and utility classes.
- No image, font, icon, or other static asset directory was found.
- Visual identity is primarily CSS and text; there is no logo asset to preserve.
- The stylesheet contains repeated theme variable blocks and page-specific
  styles. It should be migrated incrementally into Tailwind tokens and reusable
  component styles rather than mechanically discarded.

### Browser JavaScript

| File | Responsibility | Migration classification |
|---|---|---|
| `data.js` | Demo seed data, localStorage access, records, jobs, applications, audit data | Extract domain fixtures and behavior; replace persistence with API |
| `auth.js` | Demo login and role routing | Rewrite as secure auth client |
| `app.js` | Guards, logout, shared rendering/formatting | Rewrite as providers, layouts, route guards, utilities |
| `candidate.js` | Student dashboard and interview setup | Rewrite as React page/query/forms |
| `profile.js` | Profile forms and local avatar validation | Rewrite with API, object storage, server validation |
| `settings.js` | Preferences and theme | Reuse behavior; move to persisted API/user settings |
| `signup.js` | Demo multi-step signup | Rewrite with server validation/email verification |
| `recovery.js` | Simulated recovery | Rewrite with real tokenized email flow |
| `interview.js` | Interview question/answer workflow | Reuse behavior model; server persistence and timed enforcement |
| `evaluation.js` | Deterministic evaluation/result rendering | Preserve transparent rules where useful; make service/API |
| `ai-interview.js` | Deterministic adaptive text interviewer | Replace rule engine with provider abstraction plus fallback policy |
| `assessment.js` | Topic assessment | Rewrite to server-backed assessment attempts |
| `feedback.js` | Feedback display | Rewrite around persisted evaluation/feedback |
| `history.js` | Search and sort history | Reuse interaction model; query paginated API |
| `interviews.js` | Candidate interview list | Rewrite around interview API and authorization |
| `lobby.js` | Device permission check | Reuse consent UX; add real WebRTC signaling later |
| `recruiter.js` | Jobs, applications, scheduling, hiring actions | Rewrite as recruiter APIs and auditable workflow |
| `admin.js` | Admin metrics, records, audit trail | Rewrite as protected admin APIs |
| `notifications.js` | Local notifications | Rewrite around notification service and read state |
| `prep.js` | Preparation activity | Rewrite around learning/progress models |
| `leetcode.js` | Manual LeetCode progress | Reuse as optional integration/manual tracking module |
| `leetcode-data.js` | Static catalogue data | Reuse as seed/reference data after review |
| `coding.js` | Coding API client/editor interaction | Rewrite API client and Monaco UI; preserve endpoint behavior where compatible |

## Existing functionality

### Working or partially working behavior

- Demo role-aware login for Student, HR, and Administrator.
- Demo signup for student and HR roles.
- Local session and role guards.
- Interview configuration, question navigation, answer drafts, review markers,
  bookmarks, deterministic scoring, results, feedback, and history.
- Demo job publishing, application records, stage changes, scheduling, recruiter
  review, admin metrics, and local audit events.
- Student and recruiter profile fields, preferences, local avatar data URL
  validation, theme persistence, notifications, search, sorting, and goals.
- Topic assessments and preparation activity backed by browser records.
- Candidate interview lobby with explicit device permission action.
- Coding problem list/detail, Java run/submit, submission lookup/history, and
  idempotency key support through Express.
- Local Java compilation/execution with bounded input/output and timeouts.
- Optional Judge0 adapter for Java language ID 62.
- Node test coverage for API health, public problem redaction, auth rejection,
  local execution, compilation errors, and wrong answers.

### Reusable assets and concepts

- Page information architecture and labels.
- Interview lifecycle and question/answer record shape.
- Job/application stage vocabulary and audit event concept.
- Coding problem metadata, public/hidden test separation, verdict vocabulary,
  idempotency behavior, and test fixtures.
- CSS color direction, spacing, responsive breakpoints, theme variables, and
  form/card/table patterns.
- Seed/reference data after it is reviewed for production appropriateness.

### Functionality to rewrite

- Authentication, sessions, password handling, email verification, recovery,
  role checks, and all authorization.
- All localStorage persistence and cross-page state.
- Direct DOM rendering, event listeners, and page navigation.
- Job/application/interview/admin workflows with database transactions.
- Coding submission storage, queueing, isolation, limits, and multi-language
  support.
- AI interviewer/evaluation, chatbot, resume analysis, and profile enhancement.
- Profile/resume file handling and consent.
- Real-time interviews, notifications, analytics, and cross-portal queries.

### Missing functionality

The master specification is substantially broader than the existing prototype.
Missing areas include PostgreSQL/Prisma persistence; production identity and RBAC;
email delivery; student/recruiter/admin portal completeness; resume parsing and
AI analysis; persistent chatbot; real assessments and assignments; learning
hierarchy and adaptive planner; analytics/skill evidence; company verification;
candidate discovery; real interview video/signaling; moderation and misconduct
workflow; audit/security monitoring; Redis/BullMQ; object storage; hardened code
execution; multi-language coding; consent/data retention; deployment; and the
specified automated frontend, backend, security, and E2E test suites.

## Existing integrations

| Integration | Current state | Target implication |
|---|---|---|
| Browser localStorage | Primary data store | Replace with API/Prisma; retain only UI preferences/cache |
| Express | Existing coding API | Expand into modular versioned backend |
| JSON file | `server/data/submissions.json` | Replace with PostgreSQL records; preserve fixture semantics |
| Local Java/Javac | Available and used by tests | Development-only runner; never production isolation |
| Judge0 | Optional via `JUDGE0_URL` and credentials | Evaluate as isolated execution provider |
| Browser media APIs | Explicit microphone check only | Add WebRTC signaling/TURN and consent |
| LeetCode | Manual external URL/profile entry only | Treat as optional, consented integration |
| AI providers | None | Add server-side provider abstraction and credentials |

## Baseline verification

- Node.js: `v25.9.0`
- npm: `11.12.1`
- Java/Javac: `21.0.9`
- Installed npm packages: `express@5.3.0`, `dotenv@16.6.1`
- `npm test`: should be run as the first post-audit baseline; it requires Java.
- PostgreSQL client/server: not found.
- Redis: not found.
- Docker: not found.

## Backup

Git was initialized because the workspace was not a Git repository. The baseline
commit is `6c56dff` and branch `migration-backup-2026-11-03` contains the
pre-migration files, including the existing ignored submission JSON. No
substantial application migration has started.

## Audit conclusion

Treat the current repository as a behavior reference and prototype to preserve,
not as a production backend. The safest migration is an incremental strangler
path: establish the new frontend/backend/database foundation, migrate one
vertical slice at a time, keep legacy pages available during verification, and
remove legacy runtime paths only after parity tests and user approval.
