BEGIN;

CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

ALTER TABLE "User"
    ADD COLUMN "emailNormalized" VARCHAR(320),
    ADD COLUMN "fullName" VARCHAR(200),
    ADD COLUMN "profileImageUrl" VARCHAR(2048),
    ALTER COLUMN "passwordHash" DROP NOT NULL;

UPDATE "User"
SET "emailNormalized" = lower(btrim("email"));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "User"
        GROUP BY "emailNormalized"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add normalized email uniqueness: duplicate normalized email addresses exist.';
    END IF;
END
$$;

ALTER TABLE "User"
    ALTER COLUMN "emailNormalized" SET NOT NULL;

CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

ALTER TABLE "UserSession"
    ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "UserSession_userId_createdAt_idx" ON "UserSession"("userId", "createdAt");

CREATE TABLE "TokenFamily" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TokenFamily_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF EXISTS (
        SELECT "familyId"
        FROM "RefreshToken"
        GROUP BY "familyId"
        HAVING COUNT(DISTINCT "userId") > 1
    ) THEN
        RAISE EXCEPTION 'Cannot backfill token families: a refresh-token family belongs to multiple users.';
    END IF;
END
$$;

INSERT INTO "TokenFamily" ("id", "userId", "expiresAt", "createdAt", "updatedAt")
SELECT
    "familyId",
    (array_agg("userId" ORDER BY "createdAt"))[1],
    MAX("expiresAt"),
    MIN("createdAt"),
    CURRENT_TIMESTAMP
FROM "RefreshToken"
GROUP BY "familyId";

CREATE UNIQUE INDEX "TokenFamily_sessionId_key" ON "TokenFamily"("sessionId");
CREATE INDEX "TokenFamily_userId_revokedAt_expiresAt_idx" ON "TokenFamily"("userId", "revokedAt", "expiresAt");

CREATE TABLE "OAuthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "providerEmail" VARCHAR(320),
    "providerEmailVerified" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
CREATE INDEX "OAuthAccount_userId_provider_idx" ON "OAuthAccount"("userId", "provider");

CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "Company"
    ADD COLUMN "slug" VARCHAR(240),
    ADD COLUMN "officialEmailDomain" VARCHAR(253),
    ADD COLUMN "logoUrl" VARCHAR(2048),
    ADD COLUMN "verifiedAt" TIMESTAMP(3);

UPDATE "Company"
SET "slug" = COALESCE(
    NULLIF(trim(both '-' FROM regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''),
    'company'
) || '-' || "id"::text;

ALTER TABLE "Company"
    ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE INDEX "Company_officialEmailDomain_idx" ON "Company"("officialEmailDomain");

ALTER TABLE "CompanyMember"
    ADD COLUMN "invitationEmail" VARCHAR(320),
    ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
    ADD COLUMN "invitationTokenHash" VARCHAR(64),
    ADD COLUMN "invitedByUserId" UUID;

CREATE UNIQUE INDEX "CompanyMember_invitationTokenHash_key" ON "CompanyMember"("invitationTokenHash");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

ALTER TABLE "TokenFamily"
    ADD CONSTRAINT "TokenFamily_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TokenFamily_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "TokenFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthAccount"
    ADD CONSTRAINT "OAuthAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailVerificationToken"
    ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyMember"
    ADD CONSTRAINT "CompanyMember_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
