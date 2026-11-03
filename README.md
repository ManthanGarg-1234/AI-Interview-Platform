# CareerPrepAI — AI Interview Platform Prototype

CareerPrepAI is a connected, frontend-only interview workflow for a college project evaluation. It uses only HTML5, CSS3, vanilla JavaScript, and browser `localStorage`. There is no backend, secure authentication, or actual AI model.

## Run locally

Open the folder in VS Code and launch `index.html` with Live Server, or open `index.html` directly in a browser. The project has no build process, package installation, or API keys.

## Demo workflow

1. Choose **Candidate** on the landing page.
2. Select **Java Developer**, keep **Medium**, and start the interview.
3. Answer five questions, navigate with Previous/Next, and submit.
4. Review the deterministic result and response breakdown.
5. Log out, choose **Recruiter**, and open the new submission.
6. Shortlist or reject the candidate.
7. Log out, choose **Administrator**, and verify the live metrics and record table.
8. Refresh any page to confirm persistence.

## Architecture

- `index.html`, `candidate.html`, `interview.html`, `result.html`, `recruiter.html`, `interview-details.html`, and `admin.html` are page-level views.
- `js/data.js` is the single source of truth for sessions, interview records, question banks, drafts, bookmarks, goals, and localStorage access.
- `js/auth.js` handles demo login.
- `js/app.js` provides session guards, logout, formatting, and shared UI helpers.
- `js/candidate.js`, `js/interview.js`, `js/evaluation.js`, `js/recruiter.js`, and `js/admin.js` implement each workflow.
- `history.html` and `js/history.js` provide searchable and sortable candidate history.
- Demo jobs and applications are shared between [candidate.html](./candidate.html), [recruiter.html](./recruiter.html), and [admin.html](./admin.html). Recruiters can publish jobs and move applications through explicit stages; every meaningful action creates an audit event.
- `signup.html`, `forgot-password.html`, `profile.html`, and `account-settings.html` provide the demo account, profile, avatar, preference, and recovery flows.
- `css/style.css` contains the responsive visual system.

## Data model

Interview records contain an ID, candidate identity, role, category, mode, duration, question objects with IDs/topics/explanations, answers, review markers, score, topic scores, percentage, objective correct count, lifecycle status, recruiter decision, timestamps, and feedback. Records are stored under `ios_interviews`; the current demo session is `ios_session`; an in-progress draft is `ios_draft`; bookmarks and preparation goals use `ios_bookmarks` and `ios_goals`.

Jobs use stable IDs and contain required skills, role, stages, status, and company metadata. Applications link a candidate to a job and retain stage history, recruiter status, and timestamps. Audit records link a platform action to its entity and actor. These are simulated browser records, not secure multi-user data.

Users are stored separately from sessions. Shared user fields include identity, email, avatar reference, contact fields, preferences, timestamps, and role. Student profiles contain education, skills, career preferences, resume metadata, and project references. Recruiter profiles contain job title, department, company ID, and recruiter preferences. Admin profile editing cannot change role privileges.

### Demo authentication

Use these seeded demo identities on [index.html](./index.html):

- Student: `student@intervue.demo`
- HR: `hr@intervue.demo`
- Admin: `admin@intervue.demo`

Any non-empty password works for the demo login. Password values are never saved to `localStorage` or `sessionStorage`. Public signup only permits Student and HR roles; Admin is provisioned by the seeded demo data. Password recovery displays a simulated state and does not send an email.

## Coding Practice API

The new [coding.html](./coding.html) workspace uses the optional Node.js API in `server/`. It does not execute Java in the browser and it does not fabricate judge results.

### Setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Configure `JUDGE0_URL` (and `JUDGE0_API_KEY`/`JUDGE0_HOST` when required by the selected Judge0 deployment).
5. Start the API with `npm start`. In local development, the API automatically uses the installed `javac`/`java` runtime unless `LOCAL_JAVA_RUNNER=false` or `JUDGE0_URL` is configured.
6. Start the existing frontend with VS Code Live Server on `http://127.0.0.1:5500`.

The API exposes `GET /api/problems`, `GET /api/problems/:id`, `POST /api/submissions/run`, `POST /api/submissions/submit`, `GET /api/submissions/:id`, and `GET /api/users/me/submissions`. Protected endpoints require the existing demo candidate ID in the `x-demo-user-id` header; this is a development bridge, not production authentication. The API stores development submissions in `server/data/submissions.json` (ignored from source control in production deployments).

Java is currently the supported language and seeded problems use the full-program `Main` format. Hidden tests remain server-side. Local development executes Java in a temporary directory with compile/run timeouts, output limits, restricted source constructs, and a bounded heap. This local runner is real execution but is not a hardened hostile-code sandbox; use Judge0 or equivalent isolated infrastructure for shared/production deployments. The Judge0 adapter maps Java language ID 62 and sends each test independently with bounded source/input sizes and request timeouts. A production deployment still needs hardened judge infrastructure, real authentication, PostgreSQL, durable queues, provider-specific resource controls, and stronger rate limiting.

Run API tests with `npm test` after installing dependencies. The current browser-only demo authentication remains separate from the production authorization that this API requires.

## Limitations and future work

Role checks and login are intentionally simulated in localStorage and must not be treated as authorization. Evaluation is a transparent objective comparison plus keyword rubric, not an AI model. Practice, assessment, and timed challenge are client-side modes; timed challenge changes the configured timer, while answer explanations remain hidden until the result page. Theme, bookmarks, review markers, study goals, search, sorting, and reset are persisted locally. A production version would add a backend, real identity and authorization, database persistence, server-side timer/submission validation, audit logs, resume parsing, and an AI service behind a protected API.

Profile images are validated locally as PNG, JPEG, or WebP files under 1 MB and saved as browser data URLs. This is suitable only for a small demo; a production system would use managed file storage and server-side validation. Uploaded resume content is not parsed in this version, so only structured resume metadata should be treated as application data.

## Live interviews, AI practice, and feedback

- Recruiters can schedule shared interview records from [recruiter.html](./recruiter.html). The candidate sees the same record in [interviews.html](./interviews.html), receives a local notification record, and can open [lobby.html](./lobby.html) for an explicit camera/microphone device check.
- The lobby never enables devices silently and does not claim to provide two-way video. A real call requires a backend signaling service plus WebRTC offer/answer and ICE exchange. No recording is enabled.
- [ai-interview.html](./ai-interview.html) is a deterministic text practice mode. It is explicitly not a live AI voice agent. A production integration would keep provider keys server-side and use short-lived credentials.
- The deterministic interviewer now adapts its next prompt using answer completeness: strong answers receive a deeper follow-up, partial answers receive a clarification prompt, and weak answers receive a simpler diagnostic prompt. This is a transparent JavaScript rule engine, not model inference.
- [assessment.html](./assessment.html) provides real objective topic assessments for DSA, Web Development, and Core CS. Submissions calculate from selected answers, persist as practice evidence, and update the Feedback Center.
- [notifications.html](./notifications.html) provides persistent in-app notifications generated by shared scheduling changes, including mark-read and mark-all-read actions.
- [prep.html](./prep.html) records deterministic technical practice activities, and [feedback.html](./feedback.html) aggregates only saved activity evidence into supported recommendations. It displays “Not enough evidence” when there is no evidence instead of inventing a score.
- The shared practice, scheduled-interview, notification, and audit records are stored by `data.js` and are visible to the relevant portals.
