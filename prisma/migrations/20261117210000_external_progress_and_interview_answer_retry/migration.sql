-- Add persisted manual progress for externally hosted placement-sheet problems.
CREATE TABLE "SheetProblemProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SheetProblemProgress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SheetProblemProgress_userId_status_idx" ON "SheetProblemProgress"("userId", "status");
CREATE INDEX "SheetProblemProgress_problemId_status_idx" ON "SheetProblemProgress"("problemId", "status");
CREATE UNIQUE INDEX "SheetProblemProgress_userId_problemId_key" ON "SheetProblemProgress"("userId", "problemId");

ALTER TABLE "SheetProblemProgress" ADD CONSTRAINT "SheetProblemProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetProblemProgress" ADD CONSTRAINT "SheetProblemProgress_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A single saved answer and evaluation per interview question prevents duplicate processing.
CREATE UNIQUE INDEX "InterviewAnswer_questionId_participantUserId_key"
    ON "InterviewAnswer"("questionId", "participantUserId");

ALTER TABLE "InterviewEvaluation" ADD COLUMN "questionId" UUID;
CREATE UNIQUE INDEX "InterviewEvaluation_questionId_key" ON "InterviewEvaluation"("questionId");
ALTER TABLE "InterviewEvaluation" ADD CONSTRAINT "InterviewEvaluation_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
