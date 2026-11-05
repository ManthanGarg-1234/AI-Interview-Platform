-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'RECRUITER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyMemberRole" AS ENUM ('OWNER', 'HIRING_MANAGER', 'REVIEWER', 'INTERVIEWER', 'ANALYST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('SELF_DECLARED', 'CODING_RESULT', 'ASSESSMENT_RESULT', 'AI_INFERRED', 'RECRUITER_VERIFIED', 'PROJECT', 'CERTIFICATION');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('TECHNICAL', 'APTITUDE', 'CODING', 'SQL', 'SUBJECT', 'PRACTICE', 'RECRUITER', 'CONTEST');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('RUN', 'PRACTICE', 'CONTEST');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'ARCHIVED', 'CONTEST', 'RECRUITER_ASSESSMENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'QUEUED', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('PENDING', 'ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('AI_TECHNICAL', 'AI_HR', 'AI_BEHAVIORAL', 'AI_MIXED', 'RECRUITER_TECHNICAL', 'RECRUITER_HR');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'CONFIGURED', 'QUESTION_GENERATING', 'READY', 'SCHEDULED', 'IN_PROGRESS', 'EVALUATING', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RecruiterInterviewStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecruiterRoundStatus" AS ENUM ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LiveRoomStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterviewParticipantRole" AS ENUM ('CANDIDATE', 'INTERVIEWER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "RescheduleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScorecardStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FINALIZED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PROFILE_DISCOVERY', 'RESUME_SHARING', 'ASSESSMENT_SHARING', 'INTERVIEW_TRANSCRIPT', 'AI_CONTEXT', 'MEDIA_DEVICE', 'RECORDING', 'DATA_EXPORT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('FLAGGED', 'INVESTIGATION', 'EVIDENCE_REVIEW', 'DECISION', 'APPEAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'APPLICATION', 'ASSESSMENT', 'INTERVIEW', 'JOB', 'SECURITY', 'MODERATION');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'REJECTED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "FileRetentionClass" AS ENUM ('RESUME', 'INTERVIEW_MEDIA', 'MODERATION_EVIDENCE', 'EXPORT_TEMP');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AIMessageStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "AIRequestStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionTokenHash" VARCHAR(255) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "familyId" UUID NOT NULL,
    "replacedById" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(32),
    "headline" VARCHAR(180),
    "bio" TEXT,
    "location" VARCHAR(160),
    "githubUrl" VARCHAR(500),
    "linkedinUrl" VARCHAR(500),
    "portfolioUrl" VARCHAR(500),
    "discoverable" BOOLEAN NOT NULL DEFAULT false,
    "readinessScore" DECIMAL(5,2),
    "readinessFormulaVersion" TEXT,
    "readinessCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "institution" VARCHAR(200) NOT NULL,
    "degree" VARCHAR(160),
    "fieldOfStudy" VARCHAR(160),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "url" VARCHAR(500),
    "repositoryUrl" VARCHAR(500),
    "technologies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "organization" VARCHAR(200) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issuer" VARCHAR(200),
    "credentialUrl" VARCHAR(500),
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSkill" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "proficiency" DECIMAL(5,2),
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" UUID,
    "sourceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobTitle" VARCHAR(160),
    "department" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "website" VARCHAR(500),
    "description" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMember" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CompanyMemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyVerification" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "status" "CompanyStatus" NOT NULL,
    "evidenceFileId" UUID,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(160),
    "employmentType" "EmploymentType" NOT NULL,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "educationRequirement" TEXT,
    "experienceRequirement" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBookmark" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "studentUserId" UUID NOT NULL,
    "reapplicationNumber" INTEGER NOT NULL DEFAULT 1,
    "resumeId" UUID,
    "resumeVersionId" UUID,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "consentSnapshot" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStageHistory" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterNote" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
    "retentionClass" "FileRetentionClass" NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "activeVersionId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" UUID NOT NULL,
    "resumeId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "parsedText" TEXT,
    "parserVersion" TEXT,
    "createdByUserId" UUID NOT NULL,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeProcessingJob" (
    "id" UUID NOT NULL,
    "resumeVersionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeAnalysis" (
    "id" UUID NOT NULL,
    "resumeVersionId" UUID NOT NULL,
    "targetRole" VARCHAR(200) NOT NULL,
    "jobDescription" TEXT,
    "status" TEXT NOT NULL,
    "modelAlias" TEXT,
    "promptVersion" TEXT,
    "score" DECIMAL(5,2),
    "findings" JSONB NOT NULL,
    "usageRecordId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeAnalysisJob" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeAnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSuggestion" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "resumeAnalysisId" UUID,
    "fieldPath" VARCHAR(255) NOT NULL,
    "currentValue" JSONB,
    "suggestedValue" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodingProblem" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "statement" TEXT NOT NULL,
    "inputFormat" TEXT,
    "outputFormat" TEXT,
    "constraints" JSONB,
    "examples" JSONB,
    "explanation" TEXT,
    "difficulty" VARCHAR(32) NOT NULL,
    "starterCode" JSONB,
    "timeLimitMs" INTEGER NOT NULL DEFAULT 2000,
    "memoryLimitKb" INTEGER NOT NULL DEFAULT 262144,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemLanguageConfig" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "language" VARCHAR(40) NOT NULL,
    "starterCode" TEXT NOT NULL,
    "functionSignature" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProblemLanguageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTopic" (
    "problemId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "ProblemTopic_pkey" PRIMARY KEY ("problemId","topicId")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "inputRef" TEXT NOT NULL,
    "expectedOutputRef" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSubmission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "assignmentId" UUID,
    "contestId" UUID,
    "type" "SubmissionType" NOT NULL,
    "language" VARCHAR(40) NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "idempotencyKey" VARCHAR(200),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "verdict" "Verdict" NOT NULL DEFAULT 'PENDING',
    "policyVersion" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "submissionId" UUID,
    "language" VARCHAR(40) NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "customInput" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "verdict" "Verdict" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(80),
    "executionTimeMs" INTEGER,
    "memoryKb" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CodeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" UUID NOT NULL,
    "organizerUserId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxSubmissionsPerProblem" INTEGER NOT NULL DEFAULT 3,
    "allowedLanguages" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestProblem" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "penaltyPerWrong" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContestProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestRegistration" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestSubmission" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "codeSubmissionId" UUID NOT NULL,
    "language" VARCHAR(40) NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionStatusHistory" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "fromStatus" "SubmissionStatus",
    "toStatus" "SubmissionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProblemProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNSOLVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solvedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),

    CONSTRAINT "StudentProblemProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionResult" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "providerRequestId" TEXT,
    "passedTests" INTEGER NOT NULL DEFAULT 0,
    "totalTests" INTEGER NOT NULL DEFAULT 0,
    "executionTimeMs" INTEGER,
    "memoryKb" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "failureCode" TEXT,
    "perTestSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "ownerCompanyId" UUID,
    "createdByUserId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "durationSeconds" INTEGER NOT NULL,
    "negativeMarking" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "difficulty" VARCHAR(32) NOT NULL,
    "subjectId" UUID,
    "topicId" UUID,
    "answerKey" JSONB NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "assessmentId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("assessmentId","questionId")
);

-- CreateTable
CREATE TABLE "AssessmentCodingProblem" (
    "assessmentId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "AssessmentCodingProblem_pkey" PRIMARY KEY ("assessmentId","problemId")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "value" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "studentUserId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "jobId" UUID,
    "applicationId" UUID,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentReview" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "rating" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "score" DECIMAL(7,2),

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "points" DECIMAL(8,2),
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "unattemptedCount" INTEGER NOT NULL DEFAULT 0,
    "topicBreakdown" JSONB NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtopic" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,

    CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningResource" (
    "id" UUID NOT NULL,
    "subjectId" UUID,
    "topicId" UUID,
    "subtopicId" UUID,
    "title" VARCHAR(240) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "uri" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "LearningResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProgress" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "resourceId" UUID,
    "topicId" UUID,
    "status" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentActivity" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "activityType" VARCHAR(80) NOT NULL,
    "topicId" UUID,
    "sourceId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "StudentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" UUID NOT NULL,
    "studentProfileId" UUID NOT NULL,
    "targetRole" TEXT,
    "targetCompanies" JSONB,
    "deadline" TIMESTAMP(3),
    "dailyMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGoal" (
    "id" UUID NOT NULL,
    "studyPlanId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "priority" VARCHAR(32) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "StudyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTask" (
    "id" UUID NOT NULL,
    "studyPlanId" UUID NOT NULL,
    "goalId" UUID,
    "topicId" UUID,
    "title" VARCHAR(240) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "priority" VARCHAR(32) NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "StudyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTaskCompletion" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "completedByUserId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB,

    CONSTRAINT "StudyTaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRecommendation" (
    "id" UUID NOT NULL,
    "studyPlanId" UUID NOT NULL,
    "inputs" JSONB NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "StudyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterInterview" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "status" "RecruiterInterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" VARCHAR(80) NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "meetingUrl" VARCHAR(1000),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveInterviewRoom" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "status" "LiveRoomStatus" NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveInterviewRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveInterviewRoomToken" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveInterviewRoomToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveInterviewParticipant" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "InterviewParticipantRole" NOT NULL,
    "socketId" VARCHAR(120),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveInterviewParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterInterviewRound" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "RecruiterRoundStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "RecruiterInterviewRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterInterviewParticipant" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "roundId" UUID,
    "userId" UUID NOT NULL,
    "role" "InterviewParticipantRole" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterInterviewParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAvailability" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewRescheduleRequest" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "proposedStart" TIMESTAMP(3) NOT NULL,
    "proposedEnd" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "reason" TEXT,
    "status" "RescheduleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewRescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterScorecard" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "roundId" UUID,
    "evaluatorId" UUID NOT NULL,
    "status" "ScorecardStatus" NOT NULL DEFAULT 'DRAFT',
    "ratings" JSONB NOT NULL,
    "overallScore" DECIMAL(5,2),
    "recommendation" TEXT,
    "comments" TEXT,
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterScorecardCorrection" (
    "id" UUID NOT NULL,
    "scorecardId" UUID NOT NULL,
    "correctedById" UUID NOT NULL,
    "previous" JSONB NOT NULL,
    "corrected" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterScorecardCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterInterviewAudit" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterInterviewAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" UUID NOT NULL,
    "type" "InterviewType" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID NOT NULL,
    "applicationId" UUID,
    "configuration" JSONB NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "currentSequence" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "consentSnapshot" JSONB NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewParticipant" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(40) NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "InterviewParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "generatedBy" TEXT NOT NULL,
    "promptVersion" TEXT,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "participantUserId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewEvaluation" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "evaluatorUserId" UUID,
    "modelAlias" TEXT,
    "rubricVersion" TEXT NOT NULL,
    "categoryScores" JSONB NOT NULL,
    "overallScore" DECIMAL(5,2),
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewFeedback" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "audience" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibleAt" TIMESTAMP(3),

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subject" TEXT,
    "topic" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "promptVersion" TEXT,
    "modelAlias" TEXT,
    "status" "AIMessageStatus" NOT NULL DEFAULT 'COMPLETE',
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelAlias" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "requestId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(12,6),
    "actualCost" DECIMAL(12,6),
    "pricingVersion" TEXT,
    "status" "AIRequestStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelConfiguration" (
    "id" UUID NOT NULL,
    "modelAlias" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "secretRef" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "maxInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "pricingVersion" TEXT NOT NULL,
    "costPolicy" JSONB NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIEvaluation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" UUID NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DECIMAL(7,2),
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "formulaVersion" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" UUID,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "scope" JSONB NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataAccessLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "subjectUserId" UUID,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "action" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" UUID NOT NULL,
    "subjectUserId" UUID NOT NULL,
    "reportedByUserId" UUID,
    "status" "ModerationStatus" NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "decision" JSONB,
    "decidedByUserId" UUID,
    "appealDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEvidence" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "fileId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "description" TEXT NOT NULL,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DSASheet" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "author" VARCHAR(200),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DSASheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DSASheetProblem" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "problemId" UUID,
    "externalUrl" VARCHAR(1000),
    "title" VARCHAR(240) NOT NULL,
    "difficulty" VARCHAR(32),
    "topic" VARCHAR(160),
    "platform" VARCHAR(80),
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DSASheetProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DSASheetProgress" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "sheetProblemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNSOLVED',
    "solvedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "DSASheetProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetRole" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "requiredSkills" JSONB NOT NULL DEFAULT '[]',
    "dsaRequirements" JSONB NOT NULL DEFAULT '{}',
    "coreSubjects" JSONB NOT NULL DEFAULT '[]',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTargetRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "goalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentTargetRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" VARCHAR(200),
    "sessionType" VARCHAR(80) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "severity" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_sessionTokenHash_key" ON "UserSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_revokedAt_idx" ON "RefreshToken"("userId", "familyId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_expiresAt_idx" ON "RefreshToken"("familyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_discoverable_updatedAt_idx" ON "StudentProfile"("discoverable", "updatedAt");

-- CreateIndex
CREATE INDEX "Education_studentId_endDate_idx" ON "Education"("studentId", "endDate");

-- CreateIndex
CREATE INDEX "Project_studentId_createdAt_idx" ON "Project"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Experience_studentId_endDate_idx" ON "Experience"("studentId", "endDate");

-- CreateIndex
CREATE INDEX "Certification_studentId_expiresAt_idx" ON "Certification"("studentId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "StudentSkill_studentId_skillId_evidenceType_idx" ON "StudentSkill"("studentId", "skillId", "evidenceType");

-- CreateIndex
CREATE INDEX "StudentSkill_skillId_evidenceType_verifiedAt_idx" ON "StudentSkill"("skillId", "evidenceType", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkill_studentId_skillId_evidenceType_sourceId_key" ON "StudentSkill"("studentId", "skillId", "evidenceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterProfile_userId_key" ON "RecruiterProfile"("userId");

-- CreateIndex
CREATE INDEX "Company_status_name_idx" ON "Company"("status", "name");

-- CreateIndex
CREATE INDEX "CompanyMember_userId_active_idx" ON "CompanyMember"("userId", "active");

-- CreateIndex
CREATE INDEX "CompanyMember_companyId_role_active_idx" ON "CompanyMember"("companyId", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMember_companyId_userId_key" ON "CompanyMember"("companyId", "userId");

-- CreateIndex
CREATE INDEX "CompanyVerification_companyId_status_submittedAt_idx" ON "CompanyVerification"("companyId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "Job_companyId_status_deadline_idx" ON "Job"("companyId", "status", "deadline");

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_idx" ON "Job"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "JobBookmark_userId_createdAt_idx" ON "JobBookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobBookmark_userId_jobId_key" ON "JobBookmark"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSkill_jobId_skillId_key" ON "JobSkill"("jobId", "skillId");

-- CreateIndex
CREATE INDEX "Application_studentUserId_status_updatedAt_idx" ON "Application"("studentUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Application_jobId_status_updatedAt_idx" ON "Application"("jobId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_studentUserId_reapplicationNumber_key" ON "Application"("jobId", "studentUserId", "reapplicationNumber");

-- CreateIndex
CREATE INDEX "ApplicationStageHistory_applicationId_createdAt_idx" ON "ApplicationStageHistory"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "RecruiterNote_applicationId_createdAt_idx" ON "RecruiterNote"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");

-- CreateIndex
CREATE INDEX "StoredFile_ownerUserId_scanStatus_idx" ON "StoredFile"("ownerUserId", "scanStatus");

-- CreateIndex
CREATE INDEX "StoredFile_retentionClass_deletedAt_idx" ON "StoredFile"("retentionClass", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_activeVersionId_key" ON "Resume"("activeVersionId");

-- CreateIndex
CREATE INDEX "Resume_studentId_deletedAt_idx" ON "Resume"("studentId", "deletedAt");

-- CreateIndex
CREATE INDEX "ResumeVersion_fileId_idx" ON "ResumeVersion"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_resumeId_version_key" ON "ResumeVersion"("resumeId", "version");

-- CreateIndex
CREATE INDEX "ResumeProcessingJob_status_queuedAt_idx" ON "ResumeProcessingJob"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeProcessingJob_resumeVersionId_key" ON "ResumeProcessingJob"("resumeVersionId");

-- CreateIndex
CREATE INDEX "ResumeAnalysis_resumeVersionId_createdAt_idx" ON "ResumeAnalysis"("resumeVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeAnalysisJob_analysisId_key" ON "ResumeAnalysisJob"("analysisId");

-- CreateIndex
CREATE INDEX "ResumeAnalysisJob_status_queuedAt_idx" ON "ResumeAnalysisJob"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "ProfileSuggestion_studentId_status_idx" ON "ProfileSuggestion"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CodingProblem_slug_key" ON "CodingProblem"("slug");

-- CreateIndex
CREATE INDEX "CodingProblem_status_difficulty_idx" ON "CodingProblem"("status", "difficulty");

-- CreateIndex
CREATE INDEX "ProblemLanguageConfig_language_enabled_idx" ON "ProblemLanguageConfig"("language", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemLanguageConfig_problemId_language_key" ON "ProblemLanguageConfig"("problemId", "language");

-- CreateIndex
CREATE INDEX "TestCase_problemId_kind_sequence_idx" ON "TestCase"("problemId", "kind", "sequence");

-- CreateIndex
CREATE INDEX "CodeSubmission_userId_createdAt_idx" ON "CodeSubmission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeSubmission_problemId_status_idx" ON "CodeSubmission"("problemId", "status");

-- CreateIndex
CREATE INDEX "CodeSubmission_status_queuedAt_idx" ON "CodeSubmission"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeSubmission_userId_idempotencyKey_key" ON "CodeSubmission"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CodeRun_userId_createdAt_idx" ON "CodeRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeRun_status_createdAt_idx" ON "CodeRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_slug_key" ON "Contest"("slug");

-- CreateIndex
CREATE INDEX "Contest_status_startsAt_endsAt_idx" ON "Contest"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Contest_organizerUserId_createdAt_idx" ON "Contest"("organizerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestProblem_contestId_problemId_key" ON "ContestProblem"("contestId", "problemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestProblem_contestId_sequence_key" ON "ContestProblem"("contestId", "sequence");

-- CreateIndex
CREATE INDEX "ContestRegistration_userId_registeredAt_idx" ON "ContestRegistration"("userId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestRegistration_contestId_userId_key" ON "ContestRegistration"("contestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestSubmission_codeSubmissionId_key" ON "ContestSubmission"("codeSubmissionId");

-- CreateIndex
CREATE INDEX "ContestSubmission_contestId_userId_submittedAt_idx" ON "ContestSubmission"("contestId", "userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestSubmission_contestId_userId_problemId_submittedAt_key" ON "ContestSubmission"("contestId", "userId", "problemId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestSubmission_contestId_userId_problemId_sourceHash_key" ON "ContestSubmission"("contestId", "userId", "problemId", "sourceHash");

-- CreateIndex
CREATE INDEX "SubmissionStatusHistory_submissionId_createdAt_idx" ON "SubmissionStatusHistory"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentProblemProgress_userId_status_idx" ON "StudentProblemProgress"("userId", "status");

-- CreateIndex
CREATE INDEX "StudentProblemProgress_problemId_status_idx" ON "StudentProblemProgress"("problemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProblemProgress_userId_problemId_key" ON "StudentProblemProgress"("userId", "problemId");

-- CreateIndex
CREATE INDEX "ExecutionResult_submissionId_createdAt_idx" ON "ExecutionResult"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_problemId_key" ON "Bookmark"("userId", "problemId");

-- CreateIndex
CREATE INDEX "Assessment_ownerCompanyId_status_idx" ON "Assessment"("ownerCompanyId", "status");

-- CreateIndex
CREATE INDEX "Assessment_status_type_idx" ON "Assessment"("status", "type");

-- CreateIndex
CREATE INDEX "Question_subjectId_topicId_difficulty_idx" ON "Question"("subjectId", "topicId", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_sequence_key" ON "AssessmentQuestion"("assessmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCodingProblem_assessmentId_sequence_key" ON "AssessmentCodingProblem"("assessmentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_sequence_key" ON "QuestionOption"("questionId", "sequence");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_studentUserId_status_idx" ON "AssessmentAssignment"("studentUserId", "status");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_applicationId_idx" ON "AssessmentAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "AssessmentReview_assessmentId_createdAt_idx" ON "AssessmentReview"("assessmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentReview_assessmentId_attemptId_key" ON "AssessmentReview"("assessmentId", "attemptId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_userId_status_idx" ON "AssessmentAttempt"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assignmentId_attemptNumber_key" ON "AssessmentAttempt"("assignmentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAnswer_attemptId_questionId_key" ON "AssessmentAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_attemptId_key" ON "AssessmentResult"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_slug_key" ON "Topic"("subjectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subtopic_topicId_slug_key" ON "Subtopic"("topicId", "slug");

-- CreateIndex
CREATE INDEX "LearningResource_subjectId_topicId_subtopicId_status_idx" ON "LearningResource"("subjectId", "topicId", "subtopicId", "status");

-- CreateIndex
CREATE INDEX "LearningProgress_studentProfileId_lastActivityAt_idx" ON "LearningProgress"("studentProfileId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProgress_studentProfileId_resourceId_topicId_key" ON "LearningProgress"("studentProfileId", "resourceId", "topicId");

-- CreateIndex
CREATE INDEX "StudentActivity_studentProfileId_occurredAt_idx" ON "StudentActivity"("studentProfileId", "occurredAt");

-- CreateIndex
CREATE INDEX "StudentActivity_topicId_occurredAt_idx" ON "StudentActivity"("topicId", "occurredAt");

-- CreateIndex
CREATE INDEX "StudyPlan_studentProfileId_status_idx" ON "StudyPlan"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "StudyGoal_studyPlanId_status_idx" ON "StudyGoal"("studyPlanId", "status");

-- CreateIndex
CREATE INDEX "StudyTask_studyPlanId_dueAt_status_idx" ON "StudyTask"("studyPlanId", "dueAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTaskCompletion_taskId_completedByUserId_key" ON "StudyTaskCompletion"("taskId", "completedByUserId");

-- CreateIndex
CREATE INDEX "StudyRecommendation_studyPlanId_status_idx" ON "StudyRecommendation"("studyPlanId", "status");

-- CreateIndex
CREATE INDEX "RecruiterInterview_companyId_status_scheduledStart_idx" ON "RecruiterInterview"("companyId", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "RecruiterInterview_applicationId_status_idx" ON "RecruiterInterview"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveInterviewRoom_interviewId_key" ON "LiveInterviewRoom"("interviewId");

-- CreateIndex
CREATE INDEX "LiveInterviewRoom_status_expiresAt_idx" ON "LiveInterviewRoom"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveInterviewRoomToken_tokenHash_key" ON "LiveInterviewRoomToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LiveInterviewRoomToken_roomId_userId_expiresAt_idx" ON "LiveInterviewRoomToken"("roomId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "LiveInterviewParticipant_roomId_leftAt_idx" ON "LiveInterviewParticipant"("roomId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveInterviewParticipant_roomId_userId_key" ON "LiveInterviewParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RecruiterInterviewRound_interviewId_status_idx" ON "RecruiterInterviewRound"("interviewId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterInterviewRound_interviewId_sequence_key" ON "RecruiterInterviewRound"("interviewId", "sequence");

-- CreateIndex
CREATE INDEX "RecruiterInterviewParticipant_userId_role_idx" ON "RecruiterInterviewParticipant"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterInterviewParticipant_interviewId_userId_key" ON "RecruiterInterviewParticipant"("interviewId", "userId");

-- CreateIndex
CREATE INDEX "InterviewAvailability_userId_startsAt_endsAt_idx" ON "InterviewAvailability"("userId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "InterviewRescheduleRequest_interviewId_status_createdAt_idx" ON "InterviewRescheduleRequest"("interviewId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecruiterScorecard_interviewId_status_idx" ON "RecruiterScorecard"("interviewId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterScorecard_interviewId_roundId_evaluatorId_key" ON "RecruiterScorecard"("interviewId", "roundId", "evaluatorId");

-- CreateIndex
CREATE INDEX "RecruiterScorecardCorrection_scorecardId_createdAt_idx" ON "RecruiterScorecardCorrection"("scorecardId", "createdAt");

-- CreateIndex
CREATE INDEX "RecruiterInterviewAudit_interviewId_createdAt_idx" ON "RecruiterInterviewAudit"("interviewId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_status_scheduledAt_idx" ON "InterviewSession"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "InterviewSession_applicationId_idx" ON "InterviewSession"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewParticipant_sessionId_userId_key" ON "InterviewParticipant"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_sessionId_sequence_key" ON "InterviewQuestion"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "InterviewAnswer_questionId_submittedAt_idx" ON "InterviewAnswer"("questionId", "submittedAt");

-- CreateIndex
CREATE INDEX "InterviewEvaluation_sessionId_createdAt_idx" ON "InterviewEvaluation"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewFeedback_sessionId_audience_idx" ON "InterviewFeedback"("sessionId", "audience");

-- CreateIndex
CREATE INDEX "AIConversation_userId_lastMessageAt_idx" ON "AIConversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageRecord_requestId_key" ON "AIUsageRecord"("requestId");

-- CreateIndex
CREATE INDEX "AIUsageRecord_userId_createdAt_idx" ON "AIUsageRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageRecord_feature_createdAt_idx" ON "AIUsageRecord"("feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelConfiguration_modelAlias_key" ON "AIModelConfiguration"("modelAlias");

-- CreateIndex
CREATE INDEX "AIEvaluation_userId_feature_createdAt_idx" ON "AIEvaluation"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_subjectType_subjectId_periodEnd_idx" ON "AnalyticsSnapshot"("subjectType", "subjectId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_subjectType_subjectId_metricName_formulaV_key" ON "AnalyticsSnapshot"("subjectType", "subjectId", "metricName", "formulaVersion", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_type_status_idx" ON "ConsentRecord"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "DataAccessLog_subjectUserId_createdAt_idx" ON "DataAccessLog"("subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DataAccessLog_actorUserId_createdAt_idx" ON "DataAccessLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_status_createdAt_idx" ON "SecurityEvent"("severity", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationCase_subjectUserId_status_idx" ON "ModerationCase"("subjectUserId", "status");

-- CreateIndex
CREATE INDEX "ModerationCase_status_createdAt_idx" ON "ModerationCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationEvidence_caseId_createdAt_idx" ON "ModerationEvidence"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_caseId_createdAt_idx" ON "ModerationAction"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Appeal_caseId_status_idx" ON "Appeal"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DSASheet_slug_key" ON "DSASheet"("slug");

-- CreateIndex
CREATE INDEX "DSASheetProblem_sheetId_sequence_idx" ON "DSASheetProblem"("sheetId", "sequence");

-- CreateIndex
CREATE INDEX "DSASheetProgress_sheetId_userId_idx" ON "DSASheetProgress"("sheetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DSASheetProgress_sheetProblemId_userId_key" ON "DSASheetProgress"("sheetProblemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetRole_name_key" ON "TargetRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TargetRole_slug_key" ON "TargetRole"("slug");

-- CreateIndex
CREATE INDEX "StudentTargetRole_userId_isPrimary_idx" ON "StudentTargetRole"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTargetRole_userId_roleId_key" ON "StudentTargetRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "IntegrityEvent_userId_occurredAt_idx" ON "IntegrityEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrityEvent_sessionType_sessionId_occurredAt_idx" ON "IntegrityEvent"("sessionType", "sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrityEvent_severity_reviewStatus_idx" ON "IntegrityEvent"("severity", "reviewStatus");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSkill" ADD CONSTRAINT "StudentSkill_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSkill" ADD CONSTRAINT "StudentSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSkill" ADD CONSTRAINT "StudentSkill_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterProfile" ADD CONSTRAINT "RecruiterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVerification" ADD CONSTRAINT "CompanyVerification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVerification" ADD CONSTRAINT "CompanyVerification_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVerification" ADD CONSTRAINT "CompanyVerification_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyVerification" ADD CONSTRAINT "CompanyVerification_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBookmark" ADD CONSTRAINT "JobBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBookmark" ADD CONSTRAINT "JobBookmark_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterNote" ADD CONSTRAINT "RecruiterNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterNote" ADD CONSTRAINT "RecruiterNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeProcessingJob" ADD CONSTRAINT "ResumeProcessingJob_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeAnalysis" ADD CONSTRAINT "ResumeAnalysis_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeAnalysisJob" ADD CONSTRAINT "ResumeAnalysisJob_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ResumeAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSuggestion" ADD CONSTRAINT "ProfileSuggestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSuggestion" ADD CONSTRAINT "ProfileSuggestion_resumeAnalysisId_fkey" FOREIGN KEY ("resumeAnalysisId") REFERENCES "ResumeAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemLanguageConfig" ADD CONSTRAINT "ProblemLanguageConfig_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTopic" ADD CONSTRAINT "ProblemTopic_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTopic" ADD CONSTRAINT "ProblemTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSubmission" ADD CONSTRAINT "CodeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSubmission" ADD CONSTRAINT "CodeSubmission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSubmission" ADD CONSTRAINT "CodeSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssessmentAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSubmission" ADD CONSTRAINT "CodeSubmission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRun" ADD CONSTRAINT "CodeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRun" ADD CONSTRAINT "CodeRun_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRun" ADD CONSTRAINT "CodeRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CodeSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRegistration" ADD CONSTRAINT "ContestRegistration_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRegistration" ADD CONSTRAINT "ContestRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSubmission" ADD CONSTRAINT "ContestSubmission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSubmission" ADD CONSTRAINT "ContestSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSubmission" ADD CONSTRAINT "ContestSubmission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSubmission" ADD CONSTRAINT "ContestSubmission_codeSubmissionId_fkey" FOREIGN KEY ("codeSubmissionId") REFERENCES "CodeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionStatusHistory" ADD CONSTRAINT "SubmissionStatusHistory_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CodeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProblemProgress" ADD CONSTRAINT "StudentProblemProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProblemProgress" ADD CONSTRAINT "StudentProblemProgress_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionResult" ADD CONSTRAINT "ExecutionResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CodeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCodingProblem" ADD CONSTRAINT "AssessmentCodingProblem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCodingProblem" ADD CONSTRAINT "AssessmentCodingProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssessmentAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LearningResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGoal" ADD CONSTRAINT "StudyGoal_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "StudyGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTaskCompletion" ADD CONSTRAINT "StudyTaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StudyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTaskCompletion" ADD CONSTRAINT "StudyTaskCompletion_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRecommendation" ADD CONSTRAINT "StudyRecommendation_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterview" ADD CONSTRAINT "RecruiterInterview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterview" ADD CONSTRAINT "RecruiterInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterview" ADD CONSTRAINT "RecruiterInterview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInterviewRoom" ADD CONSTRAINT "LiveInterviewRoom_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInterviewRoomToken" ADD CONSTRAINT "LiveInterviewRoomToken_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveInterviewRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInterviewRoomToken" ADD CONSTRAINT "LiveInterviewRoomToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInterviewParticipant" ADD CONSTRAINT "LiveInterviewParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "LiveInterviewRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInterviewParticipant" ADD CONSTRAINT "LiveInterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewRound" ADD CONSTRAINT "RecruiterInterviewRound_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewParticipant" ADD CONSTRAINT "RecruiterInterviewParticipant_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewParticipant" ADD CONSTRAINT "RecruiterInterviewParticipant_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RecruiterInterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewParticipant" ADD CONSTRAINT "RecruiterInterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAvailability" ADD CONSTRAINT "InterviewAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRescheduleRequest" ADD CONSTRAINT "InterviewRescheduleRequest_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRescheduleRequest" ADD CONSTRAINT "InterviewRescheduleRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRescheduleRequest" ADD CONSTRAINT "InterviewRescheduleRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecard" ADD CONSTRAINT "RecruiterScorecard_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecard" ADD CONSTRAINT "RecruiterScorecard_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RecruiterInterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecard" ADD CONSTRAINT "RecruiterScorecard_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecard" ADD CONSTRAINT "RecruiterScorecard_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecardCorrection" ADD CONSTRAINT "RecruiterScorecardCorrection_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "RecruiterScorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterScorecardCorrection" ADD CONSTRAINT "RecruiterScorecardCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewAudit" ADD CONSTRAINT "RecruiterInterviewAudit_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruiterInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterInterviewAudit" ADD CONSTRAINT "RecruiterInterviewAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewEvaluation" ADD CONSTRAINT "InterviewEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewEvaluation" ADD CONSTRAINT "InterviewEvaluation_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageRecord" ADD CONSTRAINT "AIUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelConfiguration" ADD CONSTRAINT "AIModelConfiguration_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEvaluation" ADD CONSTRAINT "AIEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataAccessLog" ADD CONSTRAINT "DataAccessLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataAccessLog" ADD CONSTRAINT "DataAccessLog_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSASheetProblem" ADD CONSTRAINT "DSASheetProblem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DSASheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSASheetProblem" ADD CONSTRAINT "DSASheetProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CodingProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSASheetProgress" ADD CONSTRAINT "DSASheetProgress_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DSASheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSASheetProgress" ADD CONSTRAINT "DSASheetProgress_sheetProblemId_fkey" FOREIGN KEY ("sheetProblemId") REFERENCES "DSASheetProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DSASheetProgress" ADD CONSTRAINT "DSASheetProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTargetRole" ADD CONSTRAINT "StudentTargetRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTargetRole" ADD CONSTRAINT "StudentTargetRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "TargetRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityEvent" ADD CONSTRAINT "IntegrityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

