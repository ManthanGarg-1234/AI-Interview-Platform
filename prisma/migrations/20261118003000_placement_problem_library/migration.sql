BEGIN;

CREATE TYPE "CodingCatalogueStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PlacementProblemStatus" AS ENUM ('NOT_STARTED', 'ATTEMPTED', 'SOLVED', 'REVISION_REQUIRED');

ALTER TABLE "Problem"
  ADD COLUMN "slug" VARCHAR(220),
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "subtopic" VARCHAR(160),
  ADD COLUMN "canonicalUrl" VARCHAR(2048),
  ADD COLUMN "canonicalProblemId" UUID,
  ADD COLUMN "attribution" VARCHAR(500),
  ADD COLUMN "placementPriority" INTEGER,
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "status" "CodingCatalogueStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "Sheet"
  ADD COLUMN "slug" VARCHAR(220),
  ADD COLUMN "category" VARCHAR(80) NOT NULL DEFAULT 'DSA',
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "status" "CodingCatalogueStatus" NOT NULL DEFAULT 'PUBLISHED';

UPDATE "Sheet"
SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')) || '-' || left("id"::text, 8),
    "source" = CASE WHEN lower("source") = 'curated list' THEN 'Independently curated' ELSE "source" END;

CREATE TEMP TABLE "ProblemCanonicalMap" ON COMMIT DROP AS
SELECT
  "id",
  first_value("id") OVER (PARTITION BY normalized_url ORDER BY "createdAt", "id") AS canonical_id,
  normalized_url
FROM (
  SELECT
    "id",
    "createdAt",
    lower(regexp_replace(split_part(split_part("url", '#', 1), '?', 1), '/+$', '')) AS normalized_url
  FROM "Problem"
) normalized;

UPDATE "Problem" problem
SET "slug" = trim(both '-' from regexp_replace(lower(problem."title"), '[^a-z0-9]+', '-', 'g')) || '-' || left(problem."id"::text, 8),
    "canonicalUrl" = CASE WHEN canonical_map."id" = canonical_map.canonical_id THEN canonical_map.normalized_url ELSE NULL END,
    "canonicalProblemId" = CASE WHEN canonical_map."id" = canonical_map.canonical_id THEN NULL ELSE canonical_map.canonical_id END,
    "attribution" = CASE WHEN problem."platform" = 'LEETCODE' THEN 'LeetCode problem link; metadata independently curated' ELSE problem."platform" || ' problem link; metadata independently curated' END
FROM "ProblemCanonicalMap" canonical_map
WHERE problem."id" = canonical_map."id";

ALTER TABLE "Problem" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Sheet" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "SheetProblemProgress"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "solvedAt" TIMESTAMP(3),
  ADD COLUMN "status_new" "PlacementProblemStatus" NOT NULL DEFAULT 'NOT_STARTED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SheetProblemProgress"
    WHERE "status" NOT IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ATTEMPTED', 'SOLVED', 'REVISION_REQUIRED')
  ) THEN
    RAISE EXCEPTION 'Unsupported SheetProblemProgress status found; refusing lossy status conversion.';
  END IF;
END $$;

UPDATE "SheetProblemProgress"
SET "status_new" = CASE "status"
      WHEN 'IN_PROGRESS' THEN 'ATTEMPTED'::"PlacementProblemStatus"
      WHEN 'COMPLETED' THEN 'SOLVED'::"PlacementProblemStatus"
      WHEN 'ATTEMPTED' THEN 'ATTEMPTED'::"PlacementProblemStatus"
      WHEN 'SOLVED' THEN 'SOLVED'::"PlacementProblemStatus"
      WHEN 'REVISION_REQUIRED' THEN 'REVISION_REQUIRED'::"PlacementProblemStatus"
      ELSE 'NOT_STARTED'::"PlacementProblemStatus"
    END,
    "attempts" = CASE WHEN "status" = 'NOT_STARTED' THEN 0 ELSE 1 END,
    "solvedAt" = CASE WHEN "status" IN ('COMPLETED', 'SOLVED') THEN "completedAt" ELSE NULL END;

ALTER TABLE "SheetProblemProgress" DROP COLUMN "status";
ALTER TABLE "SheetProblemProgress" RENAME COLUMN "status_new" TO "status";

WITH grouped_progress AS (
  SELECT
    progress."userId",
    coalesce(problem."canonicalProblemId", problem."id") AS canonical_problem_id,
    max(CASE progress."status"
      WHEN 'SOLVED' THEN 4
      WHEN 'REVISION_REQUIRED' THEN 3
      WHEN 'ATTEMPTED' THEN 2
      ELSE 1
    END) AS status_rank,
    max(progress."attempts") AS attempts,
    max(coalesce(progress."solvedAt", progress."completedAt")) AS solved_at,
    max(progress."completedAt") AS completed_at,
    min(progress."createdAt") AS created_at,
    max(progress."updatedAt") AS updated_at
  FROM "SheetProblemProgress" progress
  JOIN "Problem" problem ON problem."id" = progress."problemId"
  GROUP BY progress."userId", coalesce(problem."canonicalProblemId", problem."id")
)
INSERT INTO "SheetProblemProgress" ("id", "userId", "problemId", "status", "attempts", "solvedAt", "completedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  grouped."userId",
  grouped.canonical_problem_id,
  CASE grouped.status_rank
    WHEN 4 THEN 'SOLVED'::"PlacementProblemStatus"
    WHEN 3 THEN 'REVISION_REQUIRED'::"PlacementProblemStatus"
    WHEN 2 THEN 'ATTEMPTED'::"PlacementProblemStatus"
    ELSE 'NOT_STARTED'::"PlacementProblemStatus"
  END,
  grouped.attempts,
  grouped.solved_at,
  grouped.completed_at,
  grouped.created_at,
  grouped.updated_at
FROM grouped_progress grouped
ON CONFLICT ("userId", "problemId") DO UPDATE SET
  "status" = CASE
    WHEN CASE "SheetProblemProgress"."status"
      WHEN 'SOLVED' THEN 4
      WHEN 'REVISION_REQUIRED' THEN 3
      WHEN 'ATTEMPTED' THEN 2
      ELSE 1
    END >= CASE EXCLUDED."status"
      WHEN 'SOLVED' THEN 4
      WHEN 'REVISION_REQUIRED' THEN 3
      WHEN 'ATTEMPTED' THEN 2
      ELSE 1
    END THEN "SheetProblemProgress"."status"
    ELSE EXCLUDED."status"
  END,
  "attempts" = greatest("SheetProblemProgress"."attempts", EXCLUDED."attempts"),
  "solvedAt" = greatest("SheetProblemProgress"."solvedAt", EXCLUDED."solvedAt"),
  "completedAt" = greatest("SheetProblemProgress"."completedAt", EXCLUDED."completedAt"),
  "updatedAt" = greatest("SheetProblemProgress"."updatedAt", EXCLUDED."updatedAt");

CREATE TABLE "CodingTopic" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodingTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodingSubtopic" (
  "id" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  CONSTRAINT "CodingSubtopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodingPattern" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodingPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodingProblemTopic" (
  "problemId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CodingProblemTopic_pkey" PRIMARY KEY ("problemId", "topicId")
);

CREATE TABLE "CodingProblemPattern" (
  "problemId" UUID NOT NULL,
  "patternId" UUID NOT NULL,
  CONSTRAINT "CodingProblemPattern_pkey" PRIMARY KEY ("problemId", "patternId")
);

CREATE TABLE "CodingProblemCompany" (
  "problemId" UUID NOT NULL,
  "companyName" VARCHAR(160) NOT NULL,
  "evidenceUrl" VARCHAR(2048) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "CodingProblemCompany_pkey" PRIMARY KEY ("problemId", "companyName")
);

CREATE TABLE "SheetProblem" (
  "sheetId" UUID NOT NULL,
  "problemId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  CONSTRAINT "SheetProblem_pkey" PRIMARY KEY ("sheetId", "problemId")
);

CREATE TABLE "CodingSheetEngagement" (
  "userId" UUID NOT NULL,
  "sheetId" UUID NOT NULL,
  "firstStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodingSheetEngagement_pkey" PRIMARY KEY ("userId", "sheetId")
);

CREATE TABLE "PlacementProblemBookmark" (
  "userId" UUID NOT NULL,
  "problemId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlacementProblemBookmark_pkey" PRIMARY KEY ("userId", "problemId")
);

CREATE TABLE "PlacementProblemNote" (
  "userId" UUID NOT NULL,
  "problemId" UUID NOT NULL,
  "note" VARCHAR(5000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlacementProblemNote_pkey" PRIMARY KEY ("userId", "problemId")
);

INSERT INTO "CodingTopic" ("id", "slug", "name", "category", "createdAt", "updatedAt")
SELECT
  md5('coding-topic:' || lower(topic_name))::uuid,
  trim(both '-' from regexp_replace(lower(topic_name), '[^a-z0-9]+', '-', 'g')) || '-' || left(md5(lower(topic_name)), 6),
  topic_name,
  'DSA',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT topic."name" AS topic_name
  FROM "Topic" topic
  JOIN "Sheet" sheet ON sheet."subjectId" = topic."subjectId"
) source_topics;

INSERT INTO "SheetProblem" ("sheetId", "problemId", "topicId", "sequence")
SELECT
  sheet."id",
  coalesce(problem."canonicalProblemId", problem."id"),
  coding_topic."id",
  row_number() OVER (PARTITION BY sheet."id" ORDER BY topic."name", problem."title", problem."url", problem."id")::INTEGER
FROM "Sheet" sheet
JOIN "Topic" topic ON topic."subjectId" = sheet."subjectId"
JOIN "Problem" problem ON problem."topicId" = topic."id"
JOIN "CodingTopic" coding_topic ON coding_topic."name" = topic."name"
ON CONFLICT ("sheetId", "problemId") DO NOTHING;

INSERT INTO "CodingProblemTopic" ("problemId", "topicId", "isPrimary")
SELECT DISTINCT association."problemId", association."topicId", false
FROM "SheetProblem" association;

UPDATE "CodingProblemTopic" problem_topic
SET "isPrimary" = true
FROM "Problem" problem
JOIN "Topic" legacy_topic ON legacy_topic."id" = problem."topicId"
JOIN "CodingTopic" coding_topic ON coding_topic."name" = legacy_topic."name"
WHERE problem."id" = problem_topic."problemId"
  AND coding_topic."id" = problem_topic."topicId";

CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");
CREATE UNIQUE INDEX "Problem_canonicalUrl_key" ON "Problem"("canonicalUrl");
CREATE INDEX "Problem_status_difficulty_platform_idx" ON "Problem"("status", "difficulty", "platform");
CREATE INDEX "Problem_status_placementPriority_idx" ON "Problem"("status", "placementPriority");
CREATE INDEX "Problem_canonicalProblemId_idx" ON "Problem"("canonicalProblemId");
CREATE UNIQUE INDEX "Sheet_slug_key" ON "Sheet"("slug");
CREATE INDEX "Sheet_status_category_idx" ON "Sheet"("status", "category");
CREATE INDEX "Sheet_status_source_idx" ON "Sheet"("status", "source");
CREATE INDEX "SheetProblemProgress_userId_status_idx" ON "SheetProblemProgress"("userId", "status");
CREATE INDEX "SheetProblemProgress_problemId_status_idx" ON "SheetProblemProgress"("problemId", "status");
CREATE UNIQUE INDEX "CodingTopic_slug_key" ON "CodingTopic"("slug");
CREATE UNIQUE INDEX "CodingTopic_name_key" ON "CodingTopic"("name");
CREATE UNIQUE INDEX "CodingSubtopic_topicId_slug_key" ON "CodingSubtopic"("topicId", "slug");
CREATE UNIQUE INDEX "CodingSubtopic_topicId_name_key" ON "CodingSubtopic"("topicId", "name");
CREATE UNIQUE INDEX "CodingPattern_slug_key" ON "CodingPattern"("slug");
CREATE UNIQUE INDEX "CodingPattern_name_key" ON "CodingPattern"("name");
CREATE INDEX "CodingProblemTopic_topicId_problemId_idx" ON "CodingProblemTopic"("topicId", "problemId");
CREATE INDEX "CodingProblemPattern_patternId_problemId_idx" ON "CodingProblemPattern"("patternId", "problemId");
CREATE INDEX "CodingProblemCompany_companyName_idx" ON "CodingProblemCompany"("companyName");
CREATE UNIQUE INDEX "SheetProblem_sheetId_sequence_key" ON "SheetProblem"("sheetId", "sequence");
CREATE INDEX "SheetProblem_sheetId_topicId_sequence_idx" ON "SheetProblem"("sheetId", "topicId", "sequence");
CREATE INDEX "CodingSheetEngagement_sheetId_lastActivityAt_idx" ON "CodingSheetEngagement"("sheetId", "lastActivityAt");
CREATE INDEX "PlacementProblemBookmark_userId_createdAt_idx" ON "PlacementProblemBookmark"("userId", "createdAt");
CREATE INDEX "PlacementProblemNote_userId_updatedAt_idx" ON "PlacementProblemNote"("userId", "updatedAt");

ALTER TABLE "Problem" ADD CONSTRAINT "Problem_canonicalProblemId_fkey"
  FOREIGN KEY ("canonicalProblemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SheetProblem" ADD CONSTRAINT "SheetProblem_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetProblem" ADD CONSTRAINT "SheetProblem_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetProblem" ADD CONSTRAINT "SheetProblem_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "CodingTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CodingSheetEngagement" ADD CONSTRAINT "CodingSheetEngagement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingSheetEngagement" ADD CONSTRAINT "CodingSheetEngagement_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingSubtopic" ADD CONSTRAINT "CodingSubtopic_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "CodingTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProblemTopic" ADD CONSTRAINT "CodingProblemTopic_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProblemTopic" ADD CONSTRAINT "CodingProblemTopic_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "CodingTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProblemPattern" ADD CONSTRAINT "CodingProblemPattern_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProblemPattern" ADD CONSTRAINT "CodingProblemPattern_patternId_fkey"
  FOREIGN KEY ("patternId") REFERENCES "CodingPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingProblemCompany" ADD CONSTRAINT "CodingProblemCompany_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementProblemBookmark" ADD CONSTRAINT "PlacementProblemBookmark_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementProblemBookmark" ADD CONSTRAINT "PlacementProblemBookmark_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementProblemNote" ADD CONSTRAINT "PlacementProblemNote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementProblemNote" ADD CONSTRAINT "PlacementProblemNote_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
