# Workflow State Transitions

## Application lifecycle

Allowed transitions:

```text
APPLIED -> SCREENING | WITHDRAWN | REJECTED
SCREENING -> SHORTLISTED | REJECTED | WITHDRAWN
SHORTLISTED -> ASSESSMENT | TECHNICAL_INTERVIEW | REJECTED | WITHDRAWN
ASSESSMENT -> TECHNICAL_INTERVIEW | HR_INTERVIEW | REJECTED | WITHDRAWN
TECHNICAL_INTERVIEW -> HR_INTERVIEW | SELECTED | REJECTED | WITHDRAWN
HR_INTERVIEW -> SELECTED | REJECTED | WITHDRAWN
```

Invalid transitions return `APPLICATION_STAGE_INVALID`. Every transition is a
transaction that updates the application, appends stage history, emits a
notification event, and appends an audit log. Rejection/selection requires a
reason visible according to policy.

## Job lifecycle

```text
DRAFT -> PUBLISHED -> PAUSED -> PUBLISHED
PUBLISHED -> CLOSED -> ARCHIVED
PAUSED -> CLOSED
DRAFT -> ARCHIVED
```

Only authorized company members or admins may transition jobs. Closing a job
does not silently delete applications.

## Assessment lifecycle

```text
DRAFT -> PUBLISHED -> PAUSED -> ARCHIVED
ASSIGNED -> IN_PROGRESS -> SUBMITTED -> GRADED
IN_PROGRESS -> EXPIRED
```

Autosave is allowed only while `IN_PROGRESS`. Submission is idempotent and
server-timed. Results become visible after grading according to assignment policy.

## Interview lifecycle

```text
DRAFT -> SCHEDULED -> IN_PROGRESS -> COMPLETED
SCHEDULED -> CANCELLED | EXPIRED
IN_PROGRESS -> CANCELLED | EXPIRED
```

AI sessions additionally use `QUESTION_GENERATING`, `READY`, and `EVALUATING`.
Only participants/admin support roles may join a session; all state changes are
audited.

## Moderation lifecycle

```text
FLAGGED -> INVESTIGATION -> EVIDENCE_REVIEW -> DECISION -> CLOSED
DECISION -> APPEAL -> EVIDENCE_REVIEW -> DECISION
```

AI flags create cases but do not determine outcomes. Restrictions/suspensions
require an authorized admin decision, reason, evidence references, notification,
and appeal availability where applicable.

## Transition implementation requirements

- Define allowed transitions as server-side constants and test every edge.
- Use optimistic concurrency/version checks to prevent lost updates.
- Record actor, previous state, next state, reason, request ID, and timestamp.
- Publish notifications only after the transaction commits.
- Never infer a successful transition from an HTTP 200 without persisted state.

