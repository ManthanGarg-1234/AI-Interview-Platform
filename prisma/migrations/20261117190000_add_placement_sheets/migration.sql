CREATE TABLE "Sheet" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "source" VARCHAR(160) NOT NULL,
    "subjectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Problem" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "difficulty" VARCHAR(32) NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sheet_name_key" ON "Sheet"("name");
CREATE UNIQUE INDEX "Sheet_subjectId_key" ON "Sheet"("subjectId");
CREATE UNIQUE INDEX "Problem_topicId_url_key" ON "Problem"("topicId", "url");
CREATE INDEX "Problem_topicId_difficulty_idx" ON "Problem"("topicId", "difficulty");

ALTER TABLE "Sheet"
    ADD CONSTRAINT "Sheet_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Problem"
    ADD CONSTRAINT "Problem_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
