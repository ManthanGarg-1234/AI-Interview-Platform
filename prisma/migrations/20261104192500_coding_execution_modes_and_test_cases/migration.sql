CREATE TYPE "CodingExecutionMode" AS ENUM ('STDIN_STDOUT', 'FUNCTION_BASED');

ALTER TABLE "CodingProblem"
ADD COLUMN "executionMode" "CodingExecutionMode" NOT NULL DEFAULT 'STDIN_STDOUT',
ADD COLUMN "functionName" TEXT,
ADD COLUMN "className" TEXT,
ADD COLUMN "parameterDefinitions" JSONB,
ADD COLUMN "returnType" TEXT,
ADD COLUMN "inputSerializationFormat" VARCHAR(40),
ADD COLUMN "outputSerializationFormat" VARCHAR(40);

ALTER TABLE "ProblemLanguageConfig"
ADD COLUMN "harnessTemplate" TEXT;

ALTER TABLE "TestCase"
ADD COLUMN "weight" DECIMAL(8, 2) NOT NULL DEFAULT 1.00,
ADD COLUMN "comparisonConfig" JSONB NOT NULL DEFAULT '{"mode":"TRIM_TRAILING_WHITESPACE"}'::JSONB;
