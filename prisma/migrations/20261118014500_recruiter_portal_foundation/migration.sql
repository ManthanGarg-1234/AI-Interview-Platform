BEGIN;

ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'OFFER_RELEASED';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'HIRED';

ALTER TABLE "Company"
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "Application"
  ADD COLUMN "internalTags" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "Offer" (
  "id" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "studentUserId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "designation" VARCHAR(200) NOT NULL,
  "compensation" JSONB NOT NULL,
  "joiningDate" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
  "responseReason" TEXT,
  "sentAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Offer_applicationId_status_idx" ON "Offer"("applicationId", "status");
CREATE INDEX "Offer_studentUserId_status_idx" ON "Offer"("studentUserId", "status");
CREATE INDEX "Offer_jobId_status_idx" ON "Offer"("jobId", "status");

COMMIT;
