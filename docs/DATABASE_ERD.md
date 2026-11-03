# Database Design and ERD

## Design principles

Use PostgreSQL and Prisma with UUID primary keys, UTC timestamps, foreign keys,
unique constraints, indexes on ownership/status/time filters, and transactions for
workflow transitions. JSON is reserved for genuinely flexible provider metadata,
not core relational data.

## Core model groups

- Identity: `User`, `Role`, `Permission`, `UserSession`, `RefreshToken`.
- Student: `StudentProfile`, `Education`, `Skill`, `StudentSkill`, `Project`,
  `Experience`, `Certification`.
- Recruiter/jobs: `RecruiterProfile`, `Company`, `CompanyMember`,
  `CompanyVerification`, `Job`, `JobSkill`, `Application`, `HiringStage`,
  `ApplicationStageHistory`, `RecruiterNote`.
- Resume: `Resume`, `ResumeVersion`, `ResumeAnalysis`, `ProfileSuggestion`.
- Coding: `CodingProblem`, `ProblemTopic`, `TestCase`, `CodeSubmission`,
  `ExecutionResult`, `Bookmark`.
- Assessments: `Assessment`, `AssessmentQuestion`, `QuestionOption`,
  `AssessmentAssignment`, `AssessmentAttempt`, `AssessmentAnswer`,
  `AssessmentResult`.
- Interviews: `InterviewSession`, `InterviewParticipant`, `InterviewQuestion`,
  `InterviewAnswer`, `InterviewEvaluation`, `InterviewFeedback`.
- Learning: `Subject`, `Topic`, `Subtopic`, `LearningResource`,
  `LearningProgress`, `StudentActivity`.
- Planner: `StudyPlan`, `StudyGoal`, `StudyTask`, `StudyTaskCompletion`,
  `StudyRecommendation`.
- AI: `AIConversation`, `AIMessage`, `AIUsageRecord`, `AIModelConfiguration`,
  `AIEvaluation`.
- Governance: `SecurityEvent`, `ModerationCase`, `ModerationEvidence`,
  `ModerationAction`, `Appeal`, `ConsentRecord`, `DataAccessLog`, `AuditLog`.
- Notifications: `Notification`, `NotificationPreference`.

## ER diagram

```mermaid
erDiagram
  USER ||--o| STUDENT_PROFILE : owns
  USER ||--o| RECRUITER_PROFILE : owns
  USER ||--o{ USER_SESSION : has
  USER ||--o{ REFRESH_TOKEN : rotates
  COMPANY ||--o{ COMPANY_MEMBER : includes
  USER ||--o{ COMPANY_MEMBER : joins
  COMPANY ||--o{ JOB : publishes
  JOB ||--o{ APPLICATION : receives
  USER ||--o{ APPLICATION : submits
  APPLICATION ||--o{ APPLICATION_STAGE_HISTORY : tracks
  USER ||--o{ CODE_SUBMISSION : makes
  CODING_PROBLEM ||--o{ CODE_SUBMISSION : receives
  CODE_SUBMISSION ||--o{ EXECUTION_RESULT : produces
  ASSESSMENT ||--o{ ASSESSMENT_ATTEMPT : has
  USER ||--o{ ASSESSMENT_ATTEMPT : makes
  ASSESSMENT_ATTEMPT ||--o{ ASSESSMENT_ANSWER : contains
  INTERVIEW_SESSION ||--o{ INTERVIEW_PARTICIPANT : includes
  INTERVIEW_SESSION ||--o{ INTERVIEW_QUESTION : asks
  INTERVIEW_QUESTION ||--o{ INTERVIEW_ANSWER : receives
  USER ||--o{ AI_CONVERSATION : starts
  AI_CONVERSATION ||--o{ AI_MESSAGE : contains
  STUDENT_PROFILE ||--o{ STUDY_PLAN : follows
  STUDY_PLAN ||--o{ STUDY_TASK : contains
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ AUDIT_LOG : performs
  USER ||--o{ CONSENT_RECORD : grants
```

## Migration notes

The current browser records (`ios_interviews`, `ios_session`, `ios_draft`,
`ios_bookmarks`, `ios_goals`, jobs, applications, and audit records) are not a
portable production schema. A data-migration utility should be designed after
the target Prisma schema is approved; no automatic conversion is claimed here.

The field-level contract, enum set, indexes, relation constraints, and deletion
policies are defined in [FINAL_PRISMA_SCHEMA.md](./FINAL_PRISMA_SCHEMA.md). That
document is the source of truth for executable Prisma design; this ERD remains
the relationship overview.
