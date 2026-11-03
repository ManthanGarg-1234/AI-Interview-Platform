# Interview Architecture

## Release 1 scope

Release 1 implements text-based AI interviews and recruiter-scheduled
text-enabled interviews. Voice, recording, and WebRTC video are deferred to
Release 2, but consent and extensibility are designed now.

## Lifecycle

```text
DRAFT -> CONFIGURED -> QUESTION_GENERATING -> READY -> IN_PROGRESS
  -> EVALUATING -> COMPLETED
  -> CANCELLED/EXPIRED
```

Only the server can advance a lifecycle state. A session stores configuration
snapshot, target role/subject/topics, difficulty, question count, duration,
language, rubric version, consent state, and participant IDs.

## AI interviewer flow

1. Student configures an interview.
2. Server validates limits and creates a session snapshot.
3. AI job generates or selects questions using a versioned prompt/rubric.
4. The client receives one question at a time.
5. Student submits an answer; server timestamps and persists it.
6. The interviewer may generate a bounded follow-up based on the session context.
7. Timer and question count are enforced server-side.
8. Completion queues evaluation.
9. Evaluation produces category scores, evidence-linked feedback, strengths,
   weaknesses, and recommendations.
10. Student reviews the result; editable recommendations require approval.

## Rubric

The default rubric categories are technical correctness, problem-solving,
conceptual understanding, communication, clarity, reasoning, structure, and time
management. Each score is 0-100 with a rubric version and explanatory evidence.
Insufficient answers/data produce `INSUFFICIENT_EVIDENCE`, not a fabricated score.

## Persistence and consent

- Store question, answer, follow-up, rubric version, evaluation, and usage
  records as relational records.
- Text transcript persistence is required for completed sessions and can be
  deleted subject to retention/legal hold policy.
- Voice/video recording requires a separate explicit consent record and is not
  enabled in Release 1.
- Participants can see their own session and authorized recruiter participants
  can see only assigned interview data.

## Future WebRTC design

Release 2 may add a signaling service using authenticated Socket.IO events for
offer/answer, ICE candidates, participant presence, device state, and room
closure. TURN credentials must be short-lived. Camera, microphone, screen share,
and recording each require separate consent. No media is enabled silently.

