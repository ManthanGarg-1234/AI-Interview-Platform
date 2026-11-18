BEGIN;

UPDATE "Application"
SET "status" = 'SCREENING'
WHERE "status"::text = 'ASSESSMENT';

UPDATE "ApplicationStageHistory"
SET "fromStatus" = 'SCREENING'
WHERE "fromStatus"::text = 'ASSESSMENT';

UPDATE "ApplicationStageHistory"
SET "toStatus" = 'SCREENING'
WHERE "toStatus"::text = 'ASSESSMENT';

UPDATE "CodeSubmission"
SET "type" = 'PRACTICE'
WHERE "type"::text = 'CONTEST';

ALTER TABLE "CodeSubmission"
  DROP COLUMN "assignmentId",
  DROP COLUMN "contestId";

DELETE FROM "StudentSkill"
WHERE "evidenceType"::text = 'ASSESSMENT_RESULT';

DELETE FROM "Notification"
WHERE "type"::text = 'ASSESSMENT'
   OR upper(coalesce("resourceType", '')) LIKE '%ASSESSMENT%'
   OR upper(coalesce("resourceType", '')) LIKE '%CONTEST%'
   OR upper(coalesce("resourceType", '')) LIKE '%RESOURCE%'
   OR upper(coalesce("resourceType", '')) LIKE '%MENTOR%';

DELETE FROM "ConsentRecord"
WHERE "type"::text = 'ASSESSMENT_SHARING';

DELETE FROM "StudentActivity"
WHERE upper("activityType") LIKE '%ASSESSMENT%'
   OR upper("activityType") LIKE '%CONTEST%'
   OR upper("activityType") LIKE '%RESOURCE%';

DELETE FROM "AuditLog"
WHERE upper("resourceType") LIKE '%ASSESSMENT%'
   OR upper("resourceType") LIKE '%CONTEST%'
   OR upper("resourceType") LIKE '%RESOURCE%'
   OR upper("resourceType") LIKE '%MENTOR%'
   OR upper("resourceType") LIKE '%AI_CONVERSATION%'
   OR upper("resourceType") LIKE '%AI_MESSAGE%'
   OR upper("action") LIKE '%ASSESSMENT%'
   OR upper("action") LIKE '%CONTEST%'
   OR upper("action") LIKE '%RESOURCE%'
   OR upper("action") LIKE '%MENTOR%';

DELETE FROM "DataAccessLog"
WHERE upper("resourceType") LIKE '%ASSESSMENT%'
   OR upper("resourceType") LIKE '%CONTEST%'
   OR upper("resourceType") LIKE '%RESOURCE%'
   OR upper("resourceType") LIKE '%MENTOR%'
   OR upper("resourceType") LIKE '%AI_CONVERSATION%'
   OR upper("resourceType") LIKE '%AI_MESSAGE%'
   OR upper("action") LIKE '%ASSESSMENT%'
   OR upper("action") LIKE '%CONTEST%'
   OR upper("action") LIKE '%RESOURCE%'
   OR upper("action") LIKE '%MENTOR%';

DELETE FROM "AIUsageRecord"
WHERE upper("feature") LIKE '%ASSESSMENT%'
   OR upper("feature") LIKE '%CONTEST%'
   OR upper("feature") LIKE '%MENTOR%'
   OR upper("feature") LIKE '%RESOURCE%';

DELETE FROM "AIEvaluation"
WHERE upper("feature") LIKE '%ASSESSMENT%'
   OR upper("feature") LIKE '%CONTEST%'
   OR upper("feature") LIKE '%MENTOR%'
   OR upper("feature") LIKE '%RESOURCE%';

DELETE FROM "LearningProgress"
WHERE "topicId" IS NULL OR "resourceId" IS NOT NULL;

ALTER TABLE "LearningProgress" DROP COLUMN "resourceId" CASCADE;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "studentProfileId", "topicId"
      ORDER BY ("status" = 'COMPLETED') DESC, "percent" DESC, "lastActivityAt" DESC, "id"
    ) AS position,
    bool_or("status" = 'COMPLETED') OVER (PARTITION BY "studentProfileId", "topicId") AS completed,
    max("percent") OVER (PARTITION BY "studentProfileId", "topicId") AS max_percent,
    max("lastActivityAt") OVER (PARTITION BY "studentProfileId", "topicId") AS latest_activity
  FROM "LearningProgress"
)
UPDATE "LearningProgress" AS progress
SET
  "status" = CASE WHEN ranked.completed THEN 'COMPLETED' ELSE progress."status" END,
  "percent" = ranked.max_percent,
  "lastActivityAt" = ranked.latest_activity
FROM ranked
WHERE progress."id" = ranked."id" AND ranked.position = 1;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "studentProfileId", "topicId"
      ORDER BY ("status" = 'COMPLETED') DESC, "percent" DESC, "lastActivityAt" DESC, "id"
    ) AS position
  FROM "LearningProgress"
)
DELETE FROM "LearningProgress" AS progress
USING ranked
WHERE progress."id" = ranked."id" AND ranked.position > 1;

DROP TABLE "ContestSubmission";
DROP TABLE "ContestRegistration";
DROP TABLE "ContestProblem";
DROP TABLE "Contest";

DROP TABLE "AssessmentReview";
DROP TABLE "AssessmentAnswer";
DROP TABLE "AssessmentResult";
DROP TABLE "AssessmentAttempt";
DROP TABLE "AssessmentAssignment";
DROP TABLE "AssessmentQuestion";
DROP TABLE "AssessmentCodingProblem";
DROP TABLE "QuestionOption";
DROP TABLE "Assessment";
DROP TABLE "Question";

DROP TABLE "AIMessage";
DROP TABLE "AIConversation";
DROP TABLE "LearningResource";

ALTER TABLE "LearningProgress" ALTER COLUMN "topicId" SET NOT NULL;
CREATE UNIQUE INDEX "LearningProgress_studentProfileId_topicId_key"
ON "LearningProgress"("studentProfileId", "topicId");

ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";
CREATE TYPE "ApplicationStatus" AS ENUM (
  'APPLIED', 'SCREENING', 'SHORTLISTED', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW',
  'SELECTED', 'OFFER_RELEASED', 'HIRED', 'REJECTED', 'WITHDRAWN'
);
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application"
  ALTER COLUMN "status" TYPE "ApplicationStatus"
  USING ("status"::text::"ApplicationStatus");
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
ALTER TABLE "ApplicationStageHistory"
  ALTER COLUMN "fromStatus" TYPE "ApplicationStatus"
  USING ("fromStatus"::text::"ApplicationStatus");
ALTER TABLE "ApplicationStageHistory"
  ALTER COLUMN "toStatus" TYPE "ApplicationStatus"
  USING ("toStatus"::text::"ApplicationStatus");
DROP TYPE "ApplicationStatus_old";

ALTER TYPE "SubmissionType" RENAME TO "SubmissionType_old";
CREATE TYPE "SubmissionType" AS ENUM ('RUN', 'PRACTICE');
ALTER TABLE "CodeSubmission"
  ALTER COLUMN "type" TYPE "SubmissionType"
  USING ("type"::text::"SubmissionType");
DROP TYPE "SubmissionType_old";

ALTER TYPE "EvidenceType" RENAME TO "EvidenceType_old";
CREATE TYPE "EvidenceType" AS ENUM ('SELF_DECLARED', 'CODING_RESULT', 'AI_INFERRED', 'RECRUITER_VERIFIED', 'PROJECT', 'CERTIFICATION');
ALTER TABLE "StudentSkill"
  ALTER COLUMN "evidenceType" TYPE "EvidenceType"
  USING ("evidenceType"::text::"EvidenceType");
DROP TYPE "EvidenceType_old";

ALTER TYPE "ConsentType" RENAME TO "ConsentType_old";
CREATE TYPE "ConsentType" AS ENUM ('PLATFORM_TERMS', 'PRIVACY_POLICY', 'PROFILE_DISCOVERY', 'RESUME_SHARING', 'INTERVIEW_TRANSCRIPT', 'AI_CONTEXT', 'MEDIA_DEVICE', 'RECORDING', 'DATA_EXPORT');
ALTER TABLE "ConsentRecord"
  ALTER COLUMN "type" TYPE "ConsentType"
  USING ("type"::text::"ConsentType");
DROP TYPE "ConsentType_old";

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'APPLICATION', 'INTERVIEW', 'JOB', 'SECURITY', 'MODERATION');
ALTER TABLE "Notification"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";

DROP TYPE "AssessmentType";
DROP TYPE "AssessmentStatus";
DROP TYPE "AssignmentStatus";
DROP TYPE "AttemptStatus";
DROP TYPE "ContestStatus";
DROP TYPE "AIMessageRole";
DROP TYPE "AIMessageStatus";

COMMIT;
