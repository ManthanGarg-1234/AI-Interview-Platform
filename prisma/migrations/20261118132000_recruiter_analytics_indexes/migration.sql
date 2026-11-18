CREATE INDEX "Application_jobId_status_appliedAt_idx"
ON "Application" ("jobId", "status", "appliedAt");

CREATE INDEX "ApplicationStageHistory_toStatus_createdAt_idx"
ON "ApplicationStageHistory" ("toStatus", "createdAt");

CREATE INDEX "AssessmentAttempt_assignmentId_submittedAt_idx"
ON "AssessmentAttempt" ("assignmentId", "submittedAt");

CREATE INDEX "Offer_jobId_status_expiresAt_idx"
ON "Offer" ("jobId", "status", "expiresAt");

CREATE INDEX "Offer_jobId_respondedAt_idx"
ON "Offer" ("jobId", "respondedAt");
