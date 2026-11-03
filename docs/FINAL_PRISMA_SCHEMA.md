# Final Prisma Schema Design

This is the field-level design contract for the first implementation. It is not
a migration and does not create database tables. Exact Prisma syntax may be
split into domain schema files only if the chosen tooling supports composition;
the logical names, constraints, and deletion policies below are authoritative.

## Conventions

- Every model uses `id String @id @default(uuid()) @db.Uuid` unless noted.
- Every persistent model has `createdAt DateTime @default(now())` and
  `updatedAt DateTime @updatedAt`.
- All timestamps are UTC. Sensitive content is private by default.
- Hard deletion is prohibited for audit/security/legal records. Use status,
  redaction, or anonymization.
- Foreign keys use `onDelete: Restrict` for audit-sensitive parents,
  `Cascade` only for disposable child data owned exclusively by a parent, and
  `SetNull` for optional historical references.

## Enums

```prisma
enum UserRole { STUDENT RECRUITER ADMIN }
enum AccountStatus { PENDING_VERIFICATION ACTIVE SUSPENDED DELETED }
enum CompanyMemberRole { OWNER HIRING_MANAGER REVIEWER INTERVIEWER ANALYST }
enum CompanyStatus { PENDING_VERIFICATION VERIFIED SUSPENDED REJECTED }
enum JobStatus { DRAFT PUBLISHED PAUSED CLOSED ARCHIVED }
enum EmploymentType { FULL_TIME PART_TIME CONTRACT INTERNSHIP }
enum ApplicationStatus { APPLIED SCREENING SHORTLISTED ASSESSMENT TECHNICAL_INTERVIEW HR_INTERVIEW SELECTED REJECTED WITHDRAWN }
enum EvidenceType { SELF_DECLARED CODING_RESULT ASSESSMENT_RESULT AI_INFERRED RECRUITER_VERIFIED PROJECT CERTIFICATION }
enum AssessmentType { TECHNICAL APTITUDE CODING SQL SUBJECT PRACTICE RECRUITER CONTEST }
enum AttemptStatus { NOT_STARTED IN_PROGRESS SUBMITTED EXPIRED GRADED }
enum SubmissionType { RUN PRACTICE CONTEST RECRUITER_ASSESSMENT }
enum SubmissionStatus { QUEUED RUNNING COMPLETED FAILED CANCELLED }
enum Verdict { PENDING ACCEPTED WRONG_ANSWER COMPILATION_ERROR RUNTIME_ERROR TIME_LIMIT_EXCEEDED MEMORY_LIMIT_EXCEEDED INTERNAL_ERROR }
enum InterviewType { AI_TECHNICAL AI_HR AI_BEHAVIORAL AI_MIXED RECRUITER_TECHNICAL RECRUITER_HR }
enum InterviewStatus { DRAFT SCHEDULED IN_PROGRESS COMPLETED CANCELLED EXPIRED }
enum ConsentType { PROFILE_DISCOVERY RESUME_SHARING ASSESSMENT_SHARING INTERVIEW_TRANSCRIPT AI_CONTEXT MEDIA_DEVICE RECORDING DATA_EXPORT }
enum ModerationStatus { FLAGGED INVESTIGATION EVIDENCE_REVIEW DECISION APPEAL CLOSED }
enum RecommendationStatus { PROPOSED APPROVED REJECTED APPLIED EXPIRED }
enum NotificationType { SYSTEM APPLICATION ASSESSMENT INTERVIEW JOB SECURITY MODERATION }
```

## Identity and authorization models

```prisma
model User {
  id              String        @id @default(uuid()) @db.Uuid
  email           String        @unique @db.VarChar(320)
  passwordHash    String        @db.VarChar(255)
  role            UserRole
  status          AccountStatus @default(PENDING_VERIFICATION)
  emailVerifiedAt DateTime?
  lastLoginAt     DateTime?
  suspendedAt     DateTime?
  deletedAt       DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  studentProfile  StudentProfile?
  recruiterProfile RecruiterProfile?
  sessions        UserSession[]
  refreshTokens   RefreshToken[]
  companyMembers  CompanyMember[]
  applications    Application[]
  submissions     CodeSubmission[]
  attempts        AssessmentAttempt[]
  notifications   Notification[]
  consents        ConsentRecord[]
  auditLogs       AuditLog[]
  @@index([role, status])
  @@index([status, createdAt])
}

model UserSession {
  id String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  sessionTokenHash String @unique @db.VarChar(255)
  ipAddress String? @db.VarChar(64)
  userAgent String? @db.VarChar(512)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, revokedAt, expiresAt])
}

model RefreshToken {
  id String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  tokenHash String @unique @db.VarChar(255)
  familyId String @db.Uuid
  replacedById String? @db.Uuid
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, familyId, revokedAt])
}
```

## Student, recruiter, and jobs

```prisma
model StudentProfile {
  id String @id @default(uuid()) @db.Uuid
  userId String @unique @db.Uuid
  firstName String @db.VarChar(100)
  lastName String @db.VarChar(100)
  phone String? @db.VarChar(32)
  headline String? @db.VarChar(180)
  bio String?
  location String? @db.VarChar(160)
  discoverable Boolean @default(false)
  readinessScore Decimal? @db.Decimal(5,2)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  educations Education[]
  skills StudentSkill[]
  projects Project[]
  experiences Experience[]
  certifications Certification[]
  resumes Resume[]
  studyPlans StudyPlan[]
  consents ConsentRecord[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([discoverable, updatedAt])
}

model Education {
  id String @id @default(uuid()) @db.Uuid
  studentId String @db.Uuid
  institution String @db.VarChar(200)
  degree String? @db.VarChar(160)
  fieldOfStudy String? @db.VarChar(160)
  startDate DateTime?
  endDate DateTime?
  grade Decimal? @db.Decimal(5,2)
  student StudentProfile @relation(fields: [studentId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([studentId, endDate])
}

model Skill {
  id String @id @default(uuid()) @db.Uuid
  name String @unique @db.VarChar(120)
  category String? @db.VarChar(80)
  createdAt DateTime @default(now())
  students StudentSkill[]
  jobSkills JobSkill[]
}

model StudentSkill {
  id String @id @default(uuid()) @db.Uuid
  studentId String @db.Uuid
  skillId String @db.Uuid
  evidenceType EvidenceType
  proficiency Decimal? @db.Decimal(5,2)
  verifiedAt DateTime?
  verifiedByUserId String? @db.Uuid
  sourceId String? @db.Uuid
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  student StudentProfile @relation(fields: [studentId], references: [id], onDelete: Cascade)
  skill Skill @relation(fields: [skillId], references: [id], onDelete: Restrict)
  @@unique([studentId, skillId, evidenceType, sourceId])
  @@index([skillId, evidenceType, verifiedAt])
}

model RecruiterProfile {
  id String @id @default(uuid()) @db.Uuid
  userId String @unique @db.Uuid
  jobTitle String? @db.VarChar(160)
  department String? @db.VarChar(160)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Company {
  id String @id @default(uuid()) @db.Uuid
  name String @db.VarChar(200)
  website String? @db.VarChar(500)
  description String?
  status CompanyStatus @default(PENDING_VERIFICATION)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members CompanyMember[]
  jobs Job[]
  verifications CompanyVerification[]
  @@index([status, name])
}

model CompanyMember {
  id String @id @default(uuid()) @db.Uuid
  companyId String @db.Uuid
  userId String @db.Uuid
  role CompanyMemberRole
  active Boolean @default(true)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([companyId, userId])
  @@index([userId, active])
}

model CompanyVerification {
  id String @id @default(uuid()) @db.Uuid
  companyId String @db.Uuid
  reviewedByUserId String? @db.Uuid
  status CompanyStatus
  evidenceObjectKey String?
  note String?
  reviewedAt DateTime?
  createdAt DateTime @default(now())
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@index([companyId, status, createdAt])
}

model Job {
  id String @id @default(uuid()) @db.Uuid
  companyId String @db.Uuid
  createdByUserId String @db.Uuid
  title String @db.VarChar(200)
  description String
  location String? @db.VarChar(160)
  employmentType EmploymentType
  salaryMin Decimal? @db.Decimal(12,2)
  salaryMax Decimal? @db.Decimal(12,2)
  educationRequirement String?
  experienceRequirement String?
  status JobStatus @default(DRAFT)
  deadline DateTime?
  publishedAt DateTime?
  closedAt DateTime?
  metadata Json?
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)
  skills JobSkill[]
  applications Application[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([companyId, status, deadline])
  @@index([status, publishedAt])
}

model JobSkill {
  id String @id @default(uuid()) @db.Uuid
  jobId String @db.Uuid
  skillId String @db.Uuid
  required Boolean @default(true)
  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)
  skill Skill @relation(fields: [skillId], references: [id], onDelete: Restrict)
  @@unique([jobId, skillId])
}

model Application {
  id String @id @default(uuid()) @db.Uuid
  jobId String @db.Uuid
  studentUserId String @db.Uuid
  resumeId String?
  resumeVersionId String?
  status ApplicationStatus @default(APPLIED)
  consentSnapshot Json
  appliedAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  job Job @relation(fields: [jobId], references: [id], onDelete: Restrict)
  student User @relation(fields: [studentUserId], references: [id], onDelete: Restrict)
  stageHistory ApplicationStageHistory[]
  notes RecruiterNote[]
  @@unique([jobId, studentUserId])
  @@index([studentUserId, status, updatedAt])
  @@index([jobId, status, updatedAt])
}

model ApplicationStageHistory {
  id String @id @default(uuid()) @db.Uuid
  applicationId String @db.Uuid
  fromStatus ApplicationStatus?
  toStatus ApplicationStatus
  changedByUserId String @db.Uuid
  reason String?
  createdAt DateTime @default(now())
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@index([applicationId, createdAt])
}

model RecruiterNote {
  id String @id @default(uuid()) @db.Uuid
  applicationId String @db.Uuid
  authorUserId String @db.Uuid
  body String
  private Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@index([applicationId, createdAt])
}
```

## Field-level contracts for remaining models

The following tables complete the logical schema contract. Each row is
`model: field type [required/default]`; all models also have `id`, `createdAt`,
and `updatedAt` unless the table says otherwise. Relations, indexes, and
deletion policies are explicit and must be represented in the executable Prisma
schema.

### Resume and files

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `StoredFile` | `ownerUserId UUID`, `objectKey String`, `originalName String`, `mimeType String`, `sizeBytes Int`, `sha256 String`, `scanStatus String`, `retentionClass String`, `deletedAt DateTime?` | unique `(objectKey)`; index `(ownerUserId, scanStatus)` | Cascade only after owner policy; object deleted first |
| `Resume` | `studentId UUID`, `title String`, `activeVersionId UUID?`, `visibility String`, `deletedAt DateTime?` | index `(studentId, deletedAt)` | Restrict while referenced by active application; anonymize historical reference |
| `ResumeVersion` | `resumeId UUID`, `fileId UUID`, `version Int`, `parsedText String?`, `parserVersion String?`, `createdByUserId UUID` | unique `(resumeId, version)` | Cascade with resume unless legal hold |
| `ResumeAnalysis` | `resumeVersionId UUID`, `status String`, `modelAlias String?`, `promptVersion String?`, `score Decimal?`, `findings Json`, `usageRecordId UUID?` | index `(resumeVersionId, createdAt)` | Delete with resume version; usage record minimized |
| `ProfileSuggestion` | `studentId UUID`, `resumeAnalysisId UUID?`, `fieldPath String`, `currentValue Json?`, `suggestedValue Json`, `status RecommendationStatus`, `approvedAt DateTime?` | index `(studentId, status)` | Cascade/anonymize with student |

### Coding

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `CodingProblem` | `slug String`, `title String`, `statement String`, `difficulty String`, `timeLimitMs Int`, `memoryLimitKb Int`, `status String`, `starterCode Json?` | unique `slug`; index `(status, difficulty)` | Archive, do not delete referenced problem |
| `ProblemTopic` | `problemId UUID`, `topicId UUID` | unique `(problemId, topicId)` | Cascade join |
| `TestCase` | `problemId UUID`, `kind String`, `inputRef String`, `expectedOutputRef String`, `sequence Int`, `enabled Boolean` | index `(problemId, kind, sequence)`; hidden refs never API-visible | Restrict for published problems |
| `CodeSubmission` | `userId UUID`, `problemId UUID`, `assignmentId UUID?`, `type SubmissionType`, `language String`, `sourceCode String`, `sourceHash String`, `status SubmissionStatus`, `verdict Verdict`, `idempotencyKey String?`, `queuedAt DateTime?`, `completedAt DateTime?` | unique `(userId, idempotencyKey)` when non-null; index `(userId, createdAt)`, `(problemId, status)` | Source purge by retention; preserve aggregate |
| `ExecutionResult` | `submissionId UUID`, `provider String`, `providerRequestId String?`, `passedTests Int`, `totalTests Int`, `executionTimeMs Int?`, `memoryKb Int?`, `stdout String?`, `stderr String?`, `compileOutput String?`, `failureCode String?` | unique `(submissionId)`; index `(provider, createdAt)` | Cascade with submission |
| `Bookmark` | `userId UUID`, `problemId UUID`, `note String?` | unique `(userId, problemId)` | Cascade user |

### Assessments

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `Assessment` | `ownerCompanyId UUID?`, `createdByUserId UUID`, `title String`, `type AssessmentType`, `durationSeconds Int`, `negativeMarking Decimal`, `maxAttempts Int`, `status String`, `publishedAt DateTime?` | index `(ownerCompanyId, status)`, `(status, type)` | Archive; restrict if attempts exist |
| `AssessmentQuestion` | `assessmentId UUID`, `questionId UUID`, `sequence Int`, `points Decimal`, `required Boolean` | unique `(assessmentId, questionId)` | Cascade join |
| `Question` | `body String`, `type String`, `subjectId UUID?`, `topicId UUID?`, `difficulty String`, `explanation String?`, `answerKey Json` | index `(subjectId, topicId, difficulty)` | Archive if used |
| `QuestionOption` | `questionId UUID`, `label String`, `value String`, `sequence Int` | unique `(questionId, sequence)` | Cascade |
| `AssessmentAssignment` | `assessmentId UUID`, `studentUserId UUID`, `applicationId UUID?`, `assignedByUserId UUID`, `startsAt DateTime?`, `dueAt DateTime?`, `status String` | index `(studentUserId, status)`, `(applicationId)` | Restrict while attempt exists |
| `AssessmentAttempt` | `assignmentId UUID`, `userId UUID`, `attemptNumber Int`, `status AttemptStatus`, `startedAt DateTime?`, `submittedAt DateTime?`, `expiresAt DateTime?`, `score Decimal?` | unique `(assignmentId, attemptNumber)`; index `(userId, status)` | Retain/anonymize by policy |
| `AssessmentAnswer` | `attemptId UUID`, `questionId UUID`, `answer Json`, `isCorrect Boolean?`, `points Decimal?`, `answeredAt DateTime` | unique `(attemptId, questionId)` | Delete raw answer by policy |
| `AssessmentResult` | `attemptId UUID`, `correctCount Int`, `incorrectCount Int`, `unattemptedCount Int`, `topicBreakdown Json`, `gradedAt DateTime` | unique `(attemptId)` | Retain aggregate by policy |

### Interviews

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `InterviewSession` | `type InterviewType`, `status InterviewStatus`, `createdByUserId UUID`, `applicationId UUID?`, `configuration Json`, `rubricVersion String`, `scheduledAt DateTime?`, `startedAt DateTime?`, `completedAt DateTime?`, `consentSnapshot Json` | index `(status, scheduledAt)`, `(applicationId)` | Transcript/media retention policy |
| `InterviewParticipant` | `sessionId UUID`, `userId UUID`, `role String`, `joinedAt DateTime?`, `leftAt DateTime?` | unique `(sessionId, userId)` | Cascade session |
| `InterviewQuestion` | `sessionId UUID`, `sequence Int`, `text String`, `topic String?`, `generatedBy String`, `promptVersion String?` | unique `(sessionId, sequence)` | Cascade session |
| `InterviewAnswer` | `questionId UUID`, `participantUserId UUID`, `text String`, `submittedAt DateTime`, `durationSeconds Int?` | index `(questionId, submittedAt)` | Delete/anonymize by policy |
| `InterviewEvaluation` | `sessionId UUID`, `evaluatorUserId UUID?`, `modelAlias String?`, `rubricVersion String`, `categoryScores Json`, `overallScore Decimal?`, `evidence Json`, `status String` | index `(sessionId, createdAt)` | Retain aggregate by policy |
| `InterviewFeedback` | `sessionId UUID`, `authorUserId UUID`, `audience String`, `body String`, `visibleAt DateTime?` | index `(sessionId, audience)` | Restrict recruiter private notes |

### Learning and planner

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `Subject` | `name String`, `slug String`, `status String` | unique `slug` | Archive |
| `Topic` | `subjectId UUID`, `name String`, `slug String` | unique `(subjectId, slug)` | Archive |
| `Subtopic` | `topicId UUID`, `name String`, `slug String` | unique `(topicId, slug)` | Archive |
| `LearningResource` | `subtopicId UUID?`, `title String`, `kind String`, `uri String`, `status String` | index `(subtopicId, status)` | Archive |
| `LearningProgress` | `studentProfileId UUID`, `resourceId UUID?`, `topicId UUID?`, `status String`, `percent Decimal`, `lastActivityAt DateTime` | unique `(studentProfileId, resourceId, topicId)` | Cascade student |
| `StudentActivity` | `studentProfileId UUID`, `activityType String`, `topicId UUID?`, `sourceId UUID?`, `occurredAt DateTime`, `durationSeconds Int?`, `metadata Json?` | index `(studentProfileId, occurredAt)`, `(topicId, occurredAt)` | Aggregate then purge |
| `StudyPlan` | `studentProfileId UUID`, `targetRole String?`, `targetCompanies Json?`, `deadline DateTime?`, `dailyMinutes Int?`, `status String` | index `(studentProfileId, status)` | Cascade student |
| `StudyGoal` | `studyPlanId UUID`, `title String`, `priority String`, `targetDate DateTime?`, `status String` | index `(studyPlanId, status)` | Cascade plan |
| `StudyTask` | `studyPlanId UUID`, `goalId UUID?`, `topicId UUID?`, `title String`, `dueAt DateTime?`, `priority String`, `status String`, `source String` | index `(studyPlanId, dueAt, status)` | Cascade plan |
| `StudyTaskCompletion` | `taskId UUID`, `completedByUserId UUID`, `completedAt DateTime`, `evidence Json?` | unique `(taskId, completedByUserId)` | Cascade task |
| `StudyRecommendation` | `studyPlanId UUID`, `inputs Json`, `proposedChanges Json`, `status RecommendationStatus`, `approvedAt DateTime?` | index `(studyPlanId, status)` | Cascade plan |

### AI, analytics, notifications, and governance

| Model | Fields and relations | Constraints/indexes | Deletion |
|---|---|---|---|
| `AIConversation` | `userId UUID`, `subject String?`, `topic String?`, `status String`, `lastMessageAt DateTime?` | index `(userId, lastMessageAt)` | Delete by AI policy |
| `AIMessage` | `conversationId UUID`, `role String`, `content String`, `promptVersion String?`, `modelAlias String?`, `usageRecordId UUID?`, `createdAt DateTime` | index `(conversationId, createdAt)` | Delete by AI policy |
| `AIUsageRecord` | `userId UUID`, `feature String`, `provider String`, `modelAlias String`, `promptVersion String`, `inputTokens Int`, `outputTokens Int`, `estimatedCost Decimal`, `status String`, `requestId String` | unique `(requestId)`; index `(userId, createdAt)`, `(feature, createdAt)` | Minimize/retain operationally |
| `AIModelConfiguration` | `modelAlias String`, `provider String`, `active Boolean`, `maxInputTokens Int`, `maxOutputTokens Int`, `costPolicy Json`, `updatedByUserId UUID` | unique `modelAlias` | Admin history retained |
| `AIEvaluation` | `userId UUID`, `feature String`, `sourceId UUID`, `rubricVersion String`, `scores Json`, `evidence Json`, `status String` | index `(userId, feature, createdAt)` | Delete source-linked content by policy |
| `AnalyticsSnapshot` | `subjectType String`, `subjectId UUID`, `metricName String`, `value Decimal?`, `sampleCount Int`, `formulaVersion String`, `periodStart DateTime`, `periodEnd DateTime` | unique `(subjectType, subjectId, metricName, formulaVersion, periodStart, periodEnd)` | Retain aggregate |
| `Notification` | `userId UUID`, `type NotificationType`, `title String`, `body String`, `resourceType String?`, `resourceId UUID?`, `readAt DateTime?`, `expiresAt DateTime?` | index `(userId, readAt, createdAt)` | Purge expired |
| `NotificationPreference` | `userId UUID`, `type NotificationType`, `inApp Boolean`, `email Boolean` | unique `(userId, type)` | Cascade user |
| `ConsentRecord` | `userId UUID`, `type ConsentType`, `scope Json`, `policyVersion String`, `grantedAt DateTime?`, `revokedAt DateTime?`, `source String` | index `(userId, type, revokedAt)` | Retain proof |
| `DataAccessLog` | `actorUserId UUID`, `subjectUserId UUID?`, `resourceType String`, `resourceId UUID?`, `action String`, `purpose String`, `decision String`, `requestId String`, `createdAt DateTime` | index `(subjectUserId, createdAt)`, `(actorUserId, createdAt)` | Retain by policy |
| `AuditLog` | `actorUserId UUID?`, `action String`, `resourceType String`, `resourceId UUID?`, `before Json?`, `after Json?`, `requestId String`, `ipAddress String?`, `createdAt DateTime` | index `(resourceType, resourceId, createdAt)`, `(actorUserId, createdAt)` | Append-only |
| `SecurityEvent` | `userId UUID?`, `type String`, `severity String`, `source String`, `details Json`, `status String`, `resolvedByUserId UUID?`, `resolvedAt DateTime?` | index `(severity, status, createdAt)`, `(userId, createdAt)` | Restricted retention |
| `ModerationCase` | `subjectUserId UUID`, `reportedByUserId UUID?`, `status ModerationStatus`, `category String`, `summary String`, `decision Json?`, `decidedByUserId UUID?`, `appealDueAt DateTime?` | index `(subjectUserId, status)`, `(status, createdAt)` | Legal hold aware |
| `ModerationEvidence` | `caseId UUID`, `fileId UUID?`, `sourceType String`, `sourceId UUID?`, `description String`, `hash String` | index `(caseId, createdAt)` | Preserve with case/legal hold |
| `ModerationAction` | `caseId UUID`, `actorUserId UUID`, `action String`, `reason String`, `startsAt DateTime`, `endsAt DateTime?` | index `(caseId, createdAt)` | Preserve with case |
| `Appeal` | `caseId UUID`, `submittedByUserId UUID`, `body String`, `status String`, `decidedByUserId UUID?`, `decidedAt DateTime?` | index `(caseId, status)` | Preserve with case |

## Schema gate

Before executable Prisma work begins, validate every relation name, nullable
foreign key, composite uniqueness rule, index, enum, and `onDelete` behavior
against this document. No production migration may be generated from an
incomplete model list.
