ALTER TABLE "Education"
ADD COLUMN "graduationYear" INTEGER;

ALTER TABLE "Education"
ADD CONSTRAINT "Education_graduationYear_check"
CHECK ("graduationYear" IS NULL OR "graduationYear" BETWEEN 1950 AND 2200);
