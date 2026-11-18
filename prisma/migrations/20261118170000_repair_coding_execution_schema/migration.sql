DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CodingExecutionMode'
  ) THEN
    CREATE TYPE "CodingExecutionMode" AS ENUM ('STDIN_STDOUT', 'FUNCTION_BASED');
  END IF;
END
$$;

ALTER TABLE "CodingProblem"
  ADD COLUMN IF NOT EXISTS "executionMode" "CodingExecutionMode" NOT NULL DEFAULT 'STDIN_STDOUT',
  ADD COLUMN IF NOT EXISTS "functionName" TEXT,
  ADD COLUMN IF NOT EXISTS "className" TEXT,
  ADD COLUMN IF NOT EXISTS "parameterDefinitions" JSONB,
  ADD COLUMN IF NOT EXISTS "returnType" TEXT,
  ADD COLUMN IF NOT EXISTS "inputSerializationFormat" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "outputSerializationFormat" VARCHAR(40);

ALTER TABLE "ProblemLanguageConfig"
  ADD COLUMN IF NOT EXISTS "harnessTemplate" TEXT;

ALTER TABLE "TestCase"
  ADD COLUMN IF NOT EXISTS "weight" DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS "comparisonConfig" JSONB NOT NULL DEFAULT '{"mode":"TRIM_TRAILING_WHITESPACE"}'::JSONB;
