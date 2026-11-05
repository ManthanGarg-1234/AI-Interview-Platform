"use strict";

const { Worker } = require("bullmq");
const { getPrisma } = require("./prisma");
const { scoreFor } = require("./contests");
const storage = require("./private-storage");
const { redisConnection } = require("./coding-queue");
const {
  submitAndPoll,
  compile,
  configuration: jdoodleConfiguration,
} = require("./jdoodle");
const { effectiveExecutionMode } = require("./coding-problem-config");
const {
  assertFunctionConfiguration,
  outputsMatch,
  prepareRunSource,
  serializeFunctionInput,
} = require("./coding-runner");

const terminalStatuses = new Set(["COMPLETED", "FAILED"]);
const submissionTerminalStatuses = new Set([
  "ACCEPTED",
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
  "CANCELLED",
]);
const submissionVerdictPrecedence = [
  "SYSTEM_ERROR",
  "COMPILATION_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "WRONG_ANSWER",
];
const outputLimit = 100_000;

function bounded(value) {
  return String(value || "").slice(0, outputLimit);
}

function normalizeOutput(value) {
  return bounded(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function transitionNote(verdict) {
  return `JDoodle verdict: ${verdict}.`;
}

function finalSubmissionVerdict(summaries) {
  for (const verdict of submissionVerdictPrecedence) {
    if (summaries.some((item) => item.verdict === verdict)) return verdict;
  }
  return summaries.length > 0 && summaries.every((item) => item.passed)
    ? "ACCEPTED"
    : "SYSTEM_ERROR";
}

function submissionScore(testCases, summaries) {
  const totalWeight = testCases.reduce(
    (sum, item) => sum + Number(item.weight),
    0,
  );
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return 0;
  const passedWeight = summaries.reduce(
    (sum, item, index) =>
      sum + (item.passed ? Number(testCases[index].weight) : 0),
    0,
  );
  return Math.round((passedWeight / totalWeight) * 100);
}

async function setRunFailed(prisma, runId, error) {
  await prisma.codeRun.updateMany({
    where: { id: runId, status: { not: "COMPLETED" } },
    data: {
      status: "FAILED",
      verdict: "INTERNAL_ERROR",
      provider: "jdoodle",
      stderr: bounded(error.safeMessage || error.message),
      completedAt: new Date(),
    },
  });
}

async function executeRun(prisma, runId, execution = {}) {
  const run = await prisma.codeRun.findUnique({
    where: { id: runId },
    include: {
      problem: {
        include: {
          testCases: {
            where: { kind: "PUBLIC", enabled: true },
            orderBy: { sequence: "asc" },
          },
          languageConfigs: { where: { enabled: true } },
        },
      },
    },
  });
  if (!run || terminalStatuses.has(run.status)) return;
  await prisma.codeRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", provider: "jdoodle" },
  });
  try {
    const problem = run.problem;
    const languageConfig = problem.languageConfigs.find(
      (item) => item.language === run.language,
    );
    assertFunctionConfiguration(problem, languageConfig);
    const functionBased = effectiveExecutionMode(problem) === "FUNCTION_BASED";
    const sourceCode = prepareRunSource(
      problem,
      languageConfig,
      run.sourceCode,
    );
    const compilation = await compile({ language: run.language, sourceCode });
    if (!compilation.compiled) {
      await prisma.codeRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          verdict: "COMPILATION_ERROR",
          stdout: "",
          stderr: "",
          compileOutput: bounded(compilation.output),
          perTestResults: {
            tests: [],
            totalTests: run.customInput === null ? problem.testCases.length : 0,
            executedTests: 0,
            passedTests: 0,
            failedTests: 0,
          },
          completedAt: new Date(),
        },
      });
      return;
    }
    const isCustomInput =
      run.customInput !== null && run.customInput !== undefined;
    const testCases = isCustomInput
      ? [
          {
            id: "custom-input",
            kind: "CUSTOM",
            sequence: 1,
            input: run.customInput,
            expected: null,
          },
        ]
      : problem.testCases.length
        ? problem.testCases
        : [
            {
              id: "empty-input",
              kind: "CUSTOM",
              sequence: 1,
              input: "",
              expected: null,
            },
          ];
    const results = [];
    let verdict = "ACCEPTED";
    let totalTime = 0;
    let maxMemory = 0;

    for (const [index, testCase] of testCases.entries()) {
      const testKey = testCase.id || `public-${testCase.sequence}-${index}`;
      const cached = execution.completedRunTests?.find(
        (item) => item.testKey === testKey,
      )?.result;
      if (cached) {
        results.push(cached);
        totalTime += cached.executionTimeMs || 0;
        maxMemory = Math.max(maxMemory, cached.memoryKb || 0);
        if (cached.verdict !== "ACCEPTED") {
          verdict = cached.verdict;
          break;
        }
        continue;
      }

      const test =
        testCase.input !== undefined
          ? { input: testCase.input, expected: testCase.expected }
          : await readTestCase(testCase);
      const stdin = functionBased
        ? serializeFunctionInput(test.input, problem.inputSerializationFormat)
        : test.input;
      const result = await submitAndPoll({
        language: run.language,
        sourceCode,
        stdin,
        cpuTimeLimitMs: problem.timeLimitMs,
        memoryLimitKb: problem.memoryLimitKb,
        providerToken: execution.providerTokens?.[testKey],
        onProviderToken: (providerToken) =>
          execution.persistRunProviderToken?.(testKey, providerToken),
      });
      let compared =
        test.expected === null || test.expected === undefined ? null : false;
      if (compared !== null && result.verdict === "ACCEPTED") {
        try {
          compared = outputsMatch(
            result.stdout,
            test.expected,
            testCase.comparisonConfig,
            problem,
          );
        } catch (error) {
          if (error.code !== "FUNCTION_OUTPUT_INVALID") throw error;
          compared = false;
        }
      }
      const testVerdict =
        result.verdict === "ACCEPTED" && compared === false
          ? "WRONG_ANSWER"
          : result.verdict;
      const testResult = {
        sequence: testCase.sequence,
        kind: testCase.kind,
        input: bounded(test.input),
        expectedOutput:
          test.expected === null || test.expected === undefined
            ? null
            : bounded(test.expected),
        stdout: bounded(result.stdout),
        stderr: bounded(result.stderr),
        compileOutput: bounded(result.compileOutput),
        executionTimeMs: result.executionTimeMs,
        memoryKb: result.memoryKb,
        passed: compared === null ? null : compared,
        verdict: testVerdict,
        testKey,
      };
      results.push(testResult);
      totalTime += result.executionTimeMs || 0;
      maxMemory = Math.max(maxMemory, result.memoryKb || 0);
      await execution.persistRunTestResult?.(testKey, testResult);
      if (testVerdict !== "ACCEPTED") {
        verdict = testVerdict;
        break;
      }
    }

    const publicResults = results.filter(
      (item) => item.kind === "PUBLIC" || item.kind === "CUSTOM",
    );
    const passedTests = publicResults.filter(
      (item) => item.passed === true,
    ).length;
    const failedTests = publicResults.filter(
      (item) => item.passed === false,
    ).length;
    const perTestResults = {
      tests: publicResults.map(({ testKey: _testKey, ...item }) => item),
      totalTests: testCases.filter((item) => item.kind === "PUBLIC").length,
      executedTests: publicResults.length,
      passedTests,
      failedTests,
    };
    await prisma.codeRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        verdict,
        executionTimeMs: totalTime,
        memoryKb: maxMemory || null,
        stdout: publicResults.at(-1)?.stdout || "",
        stderr: publicResults.at(-1)?.stderr || "",
        compileOutput: publicResults.at(-1)?.compileOutput || "",
        perTestResults,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    if (error.retryable) {
      await prisma.codeRun.update({
        where: { id: run.id },
        data: { status: "QUEUED" },
      });
      throw error;
    }
    await setRunFailed(prisma, run.id, error);
  }
}

async function readTestCase(testCase) {
  let input;
  let expected;
  try {
    [input, expected] = await Promise.all([
      storage.get(testCase.inputRef),
      storage.get(testCase.expectedOutputRef),
    ]);
  } catch (error) {
    throw Object.assign(new Error("Test-case data could not be loaded."), {
      code: "TEST_CASE_STORAGE_UNAVAILABLE",
      cause: error,
    });
  }
  return { input: input.toString("utf8"), expected: expected.toString("utf8") };
}

async function executeSubmission(prisma, submissionId, execution = {}) {
  const submission = await prisma.codeSubmission.findUnique({
    where: { id: submissionId },
    include: {
      problem: {
        include: {
          testCases: { where: { enabled: true }, orderBy: { sequence: "asc" } },
          languageConfigs: { where: { enabled: true } },
        },
      },
      contestSubmission: { include: { contest: true, problem: true } },
    },
  });
  if (!submission || submissionTerminalStatuses.has(submission.status)) return;
  const claimed = await prisma.$transaction(async (tx) => {
    const changed = await tx.codeSubmission.updateMany({
      where: { id: submission.id, status: "QUEUED" },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (!changed.count) return false;
    await tx.submissionStatusHistory.create({
      data: {
        submissionId: submission.id,
        fromStatus: "QUEUED",
        toStatus: "PROCESSING",
      },
    });
    return true;
  });
  if (!claimed) return;

  const summaries = [];
  let totalTime = 0;
  let maxMemory = 0;
  const publicFeedback = { stdout: "", stderr: "", compileOutput: "" };
  let finalVerdict = "SYSTEM_ERROR";
  try {
    const problem = submission.problem;
    const languageConfig = problem.languageConfigs.find(
      (item) => item.language === submission.language,
    );
    assertFunctionConfiguration(problem, languageConfig);
    const functionBased = effectiveExecutionMode(problem) === "FUNCTION_BASED";
    const sourceCode = prepareRunSource(
      problem,
      languageConfig,
      submission.sourceCode,
    );
    const compilation = await compile({
      language: submission.language,
      sourceCode,
    });
    if (!compilation.compiled) {
      finalVerdict = "COMPILATION_ERROR";
      publicFeedback.compileOutput = bounded(compilation.output);
      await prisma.$transaction(async (tx) => {
        await tx.codeSubmission.update({
          where: { id: submission.id },
          data: { status: "EVALUATING" },
        });
        await tx.submissionStatusHistory.create({
          data: {
            submissionId: submission.id,
            fromStatus: "PROCESSING",
            toStatus: "EVALUATING",
          },
        });
        await tx.executionResult.create({
          data: {
            submissionId: submission.id,
            provider: "jdoodle",
            passedTests: 0,
            totalTests: problem.testCases.length,
            stdout: "",
            stderr: "",
            compileOutput: publicFeedback.compileOutput,
            failureCode: "COMPILATION_ERROR",
            perTestSummary: {
              tests: [],
              evaluatedTests: 0,
              score: 0,
              publicFeedback,
            },
          },
        });
        await tx.codeSubmission.update({
          where: { id: submission.id },
          data: {
            status: finalVerdict,
            verdict: finalVerdict,
            completedAt: new Date(),
          },
        });
        await tx.submissionStatusHistory.create({
          data: {
            submissionId: submission.id,
            fromStatus: "EVALUATING",
            toStatus: finalVerdict,
            note: transitionNote(finalVerdict),
          },
        });
      });
      return;
    }

    for (const [index, testCase] of problem.testCases.entries()) {
      const testKey = `${testCase.kind}:${testCase.sequence}:${index}`;
      const cached = execution.completedSubmissionTests?.find(
        (item) => item.testKey === testKey,
      )?.result;
      if (cached) {
        summaries.push(cached);
        totalTime += cached.executionTimeMs || 0;
        maxMemory = Math.max(maxMemory, cached.memoryKb || 0);
        if (testCase.kind === "PUBLIC") {
          publicFeedback.stdout = cached.stdout || "";
          publicFeedback.stderr = cached.stderr || "";
          publicFeedback.compileOutput = cached.compileOutput || "";
        }
        continue;
      }

      const test = await readTestCase(testCase);
      const stdin = functionBased
        ? serializeFunctionInput(test.input, problem.inputSerializationFormat)
        : test.input;
      const result = await submitAndPoll({
        language: submission.language,
        sourceCode,
        stdin,
        cpuTimeLimitMs: problem.timeLimitMs,
        memoryLimitKb: problem.memoryLimitKb,
        providerToken: execution.submissionProviderTokens?.[testKey],
        onProviderToken: (providerToken) =>
          execution.persistSubmissionProviderToken?.(testKey, providerToken),
      });
      totalTime += result.executionTimeMs || 0;
      maxMemory = Math.max(maxMemory, result.memoryKb || 0);

      let passed = false;
      let verdict = result.verdict;
      if (verdict === "ACCEPTED") {
        try {
          passed = outputsMatch(
            result.stdout,
            test.expected,
            testCase.comparisonConfig,
            problem,
          );
          if (!passed) verdict = "WRONG_ANSWER";
        } catch (error) {
          if (error.code !== "FUNCTION_OUTPUT_INVALID") throw error;
          verdict = "WRONG_ANSWER";
        }
      }

      const summary = {
        testKey,
        sequence: testCase.sequence,
        kind: testCase.kind,
        passed,
        verdict,
        executionTimeMs: result.executionTimeMs,
        memoryKb: result.memoryKb,
        ...(testCase.kind === "PUBLIC"
          ? {
              stdout: bounded(result.stdout),
              stderr: bounded(result.stderr),
              compileOutput: bounded(result.compileOutput),
            }
          : {}),
      };
      summaries.push(summary);
      if (testCase.kind === "PUBLIC") {
        publicFeedback.stdout = summary.stdout;
        publicFeedback.stderr = summary.stderr;
        publicFeedback.compileOutput = summary.compileOutput;
      }
      await execution.persistSubmissionTestResult?.(testKey, summary);
    }

    finalVerdict = finalSubmissionVerdict(summaries);
    const passedTests = summaries.filter((item) => item.passed).length;
    const score = submissionScore(problem.testCases, summaries);
    const testSummaries = summaries.map(
      ({ testKey: _testKey, ...item }) => item,
    );
    const perTestSummary = {
      tests: testSummaries,
      evaluatedTests: summaries.length,
      score,
      publicFeedback,
    };

    await prisma.$transaction(async (tx) => {
      await tx.codeSubmission.update({
        where: { id: submission.id },
        data: { status: "EVALUATING" },
      });
      await tx.submissionStatusHistory.create({
        data: {
          submissionId: submission.id,
          fromStatus: "PROCESSING",
          toStatus: "EVALUATING",
        },
      });
      await tx.executionResult.create({
        data: {
          submissionId: submission.id,
          provider: "jdoodle",
          passedTests,
          totalTests: problem.testCases.length,
          executionTimeMs: totalTime,
          memoryKb: maxMemory || null,
          stdout: publicFeedback.stdout,
          stderr: publicFeedback.stderr,
          compileOutput: publicFeedback.compileOutput,
          failureCode: finalVerdict === "ACCEPTED" ? null : finalVerdict,
          perTestSummary,
        },
      });
      await tx.codeSubmission.update({
        where: { id: submission.id },
        data: {
          status: finalVerdict,
          verdict: finalVerdict,
          completedAt: new Date(),
        },
      });
      await tx.submissionStatusHistory.create({
        data: {
          submissionId: submission.id,
          fromStatus: "EVALUATING",
          toStatus: finalVerdict,
          note: transitionNote(finalVerdict),
        },
      });
      if (submission.type === "CONTEST" && submission.contestSubmission) {
        const contest = submission.contestSubmission;
        const wrongCount = await tx.contestSubmission.count({
          where: {
            contestId: contest.contestId,
            userId: submission.userId,
            problemId: submission.problemId,
            solved: false,
          },
        });
        const accepted = finalVerdict === "ACCEPTED";
        const priorWrong = accepted ? Math.max(0, wrongCount - 1) : wrongCount;
        await tx.contestSubmission.update({
          where: { id: contest.id },
          data: {
            solved: accepted,
            wrongAttempts: priorWrong,
            score: accepted
              ? scoreFor(
                  {
                    points: contest.problem.points,
                    penaltyPerWrong: contest.problem.penaltyPerWrong,
                  },
                  priorWrong,
                )
              : 0,
          },
        });
      } else if (finalVerdict === "ACCEPTED") {
        await tx.studentProblemProgress.update({
          where: {
            userId_problemId: {
              userId: submission.userId,
              problemId: submission.problemId,
            },
          },
          data: { status: "SOLVED", solvedAt: new Date() },
        });
        const sheetEntries = await tx.dSASheetProblem.findMany({
          where: {
            problemId: submission.problemId,
            sheet: { status: "PUBLISHED" },
          },
          select: { id: true, sheetId: true },
        });
        await Promise.all(
          sheetEntries.map((entry) =>
            tx.dSASheetProgress.upsert({
              where: {
                sheetProblemId_userId: {
                  sheetProblemId: entry.id,
                  userId: submission.userId,
                },
              },
              update: { status: "SOLVED", solvedAt: new Date() },
              create: {
                sheetId: entry.sheetId,
                sheetProblemId: entry.id,
                userId: submission.userId,
                status: "SOLVED",
                solvedAt: new Date(),
              },
            }),
          ),
        );
      }
    });
  } catch (error) {
    if (error.retryable) {
      await prisma.$transaction(async (tx) => {
        await tx.codeSubmission.update({
          where: { id: submission.id },
          data: { status: "QUEUED", startedAt: null },
        });
        await tx.submissionStatusHistory.create({
          data: {
            submissionId: submission.id,
            fromStatus: "PROCESSING",
            toStatus: "QUEUED",
            note: "Retrying after a temporary execution-provider failure.",
          },
        });
      });
      throw error;
    }

    finalVerdict = "SYSTEM_ERROR";
    publicFeedback.stderr = bounded(error.safeMessage || error.message);
    const passedTests = summaries.filter((item) => item.passed).length;
    const score = submissionScore(submission.problem.testCases, summaries);
    const testSummaries = summaries.map(
      ({ testKey: _testKey, ...item }) => item,
    );
    await prisma.$transaction(async (tx) => {
      await tx.executionResult.create({
        data: {
          submissionId: submission.id,
          provider: "jdoodle",
          passedTests,
          totalTests: submission.problem.testCases.length,
          executionTimeMs: totalTime,
          memoryKb: maxMemory || null,
          stdout: publicFeedback.stdout,
          stderr: publicFeedback.stderr,
          compileOutput: publicFeedback.compileOutput,
          failureCode: error.code || "SYSTEM_ERROR",
          perTestSummary: {
            tests: testSummaries,
            evaluatedTests: summaries.length,
            score,
            publicFeedback,
          },
        },
      });
      await tx.codeSubmission.update({
        where: { id: submission.id },
        data: {
          status: "SYSTEM_ERROR",
          verdict: "SYSTEM_ERROR",
          completedAt: new Date(),
        },
      });
      await tx.submissionStatusHistory.create({
        data: {
          submissionId: submission.id,
          fromStatus: "PROCESSING",
          toStatus: "SYSTEM_ERROR",
          note: error.code || "SYSTEM_ERROR",
        },
      });
    });
  }
}

function hasLegacyProviderState(data) {
  const providerTokens = data.providerTokens || {};
  const submissionProviderTokens = data.submissionProviderTokens || {};
  return (
    (data.provider && data.provider !== "jdoodle") ||
    Boolean(data.providerToken) ||
    Object.keys(providerTokens).length > 0 ||
    Object.keys(submissionProviderTokens).length > 0 ||
    (!data.provider &&
      (data.completedRunTests?.length || data.completedSubmissionTests?.length))
  );
}

async function failLegacyQueueJob(prisma, job) {
  const error = Object.assign(
    new Error(
      "This queued execution was interrupted during provider migration. Resubmit it to run with JDoodle.",
    ),
    { code: "CODING_PROVIDER_MIGRATION_STALE_JOB" },
  );
  if (job.data.kind === "run") return setRunFailed(prisma, job.data.id, error);
  if (job.data.kind !== "submission")
    throw new Error("Unknown coding execution job.");
  const submission = await prisma.codeSubmission.findUnique({
    where: { id: job.data.id },
    select: { status: true },
  });
  if (!submission || submissionTerminalStatuses.has(submission.status)) return;
  await prisma.$transaction(async (tx) => {
    const changed = await tx.codeSubmission.updateMany({
      where: {
        id: job.data.id,
        status: { notIn: [...submissionTerminalStatuses] },
      },
      data: {
        status: "SYSTEM_ERROR",
        verdict: "SYSTEM_ERROR",
        completedAt: new Date(),
      },
    });
    if (!changed.count) return;
    await tx.executionResult.create({
      data: {
        submissionId: job.data.id,
        provider: "jdoodle",
        passedTests: 0,
        totalTests: 0,
        failureCode: error.code,
        perTestSummary: { tests: [], evaluatedTests: 0, score: 0 },
      },
    });
    await tx.submissionStatusHistory.create({
      data: {
        submissionId: job.data.id,
        fromStatus: submission.status,
        toStatus: "SYSTEM_ERROR",
        note: error.code,
      },
    });
  });
}

async function executeCodingJob(prisma, job) {
  if (hasLegacyProviderState(job.data)) return failLegacyQueueJob(prisma, job);
  const execution = {
    completedRunTests: job.data.completedRunTests || [],
    completedSubmissionTests: job.data.completedSubmissionTests || [],
    persistRunTestResult: async (testKey, result) => {
      const completedRunTests = [
        ...(job.data.completedRunTests || []).filter(
          (item) => item.testKey !== testKey,
        ),
        { testKey, result },
      ];
      await job.updateData({ ...job.data, completedRunTests });
    },
    persistSubmissionTestResult: async (testKey, result) => {
      const completedSubmissionTests = [
        ...(job.data.completedSubmissionTests || []).filter(
          (item) => item.testKey !== testKey,
        ),
        { testKey, result },
      ];
      await job.updateData({ ...job.data, completedSubmissionTests });
    },
  };
  if (job.data.kind === "run")
    return executeRun(prisma, job.data.id, execution);
  if (job.data.kind === "submission")
    return executeSubmission(prisma, job.data.id, execution);
  throw new Error("Unknown coding execution job.");
}

function startCodingWorker() {
  jdoodleConfiguration();
  const rawConcurrency = process.env.JDOODLE_WORKER_CONCURRENCY || "1";
  const concurrency = Number(rawConcurrency);
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 20
  ) {
    throw Object.assign(
      new Error(
        "JDOODLE_WORKER_CONCURRENCY must be an integer between 1 and 20.",
      ),
      { code: "JDOODLE_CONFIGURATION_INVALID" },
    );
  }
  const worker = new Worker(
    "coding-execution",
    (job) => executeCodingJob(getPrisma(), job),
    { connection: redisConnection(), concurrency },
  );
  worker.on("stalled", async (jobId) => {
    const prefix = "coding-submission-";
    if (!jobId.startsWith(prefix)) return;
    const prisma = getPrisma();
    const submissionId = jobId.slice(prefix.length);
    try {
      await prisma.$transaction(async (tx) => {
        const submission = await tx.codeSubmission.findUnique({
          where: { id: submissionId },
          select: { status: true },
        });
        if (
          !submission ||
          !["PROCESSING", "EVALUATING"].includes(submission.status)
        )
          return;
        const changed = await tx.codeSubmission.updateMany({
          where: { id: submissionId, status: submission.status },
          data: { status: "QUEUED", startedAt: null },
        });
        if (changed.count) {
          await tx.submissionStatusHistory.create({
            data: {
              submissionId,
              fromStatus: submission.status,
              toStatus: "QUEUED",
              note: "Requeued after a worker interruption.",
            },
          });
        }
      });
    } catch (error) {
      console.error(
        `Stalled coding submission recovery failed (${error.code || "CODING_RECOVERY_FAILED"}).`,
      );
    }
  });
  worker.on("failed", async (job, error) => {
    console.error(
      `Coding job ${job?.id || "unknown"} failed (${error.code || "CODING_EXECUTION_FAILED"}).`,
    );
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    const prisma = getPrisma();
    if (job.data.kind === "run")
      return setRunFailed(prisma, job.data.id, error);
    if (job.data.kind === "submission") {
      const submission = await prisma.codeSubmission.findUnique({
        where: { id: job.data.id },
        include: {
          problem: {
            include: {
              testCases: {
                where: { enabled: true },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      });
      if (!submission || submissionTerminalStatuses.has(submission.status))
        return;
      const summaries = (job.data.completedSubmissionTests || []).map(
        (item) => item.result,
      );
      const score = submissionScore(submission.problem.testCases, summaries);
      const tests = summaries.map(({ testKey: _testKey, ...item }) => item);
      const passedTests = summaries.filter((item) => item.passed).length;
      const executionTimeMs = summaries.reduce(
        (sum, item) => sum + (item.executionTimeMs || 0),
        0,
      );
      const memoryKb = Math.max(
        0,
        ...summaries.map((item) => item.memoryKb || 0),
      );
      await prisma.$transaction(async (tx) => {
        const changed = await tx.codeSubmission.updateMany({
          where: {
            id: submission.id,
            status: { notIn: [...submissionTerminalStatuses] },
          },
          data: {
            status: "SYSTEM_ERROR",
            verdict: "SYSTEM_ERROR",
            completedAt: new Date(),
          },
        });
        if (!changed.count) return;
        await tx.executionResult.create({
          data: {
            submissionId: submission.id,
            provider: "jdoodle",
            passedTests,
            totalTests: submission.problem.testCases.length,
            executionTimeMs,
            memoryKb: memoryKb || null,
            failureCode: error.code || "SYSTEM_ERROR",
            perTestSummary: { tests, evaluatedTests: summaries.length, score },
          },
        });
        await tx.submissionStatusHistory.create({
          data: {
            submissionId: submission.id,
            fromStatus: submission.status,
            toStatus: "SYSTEM_ERROR",
            note: error.code || "SYSTEM_ERROR",
          },
        });
      });
    }
  });
  return worker;
}

if (require.main === module) {
  startCodingWorker();
  console.log("Coding execution worker started.");
}

module.exports = {
  startCodingWorker,
  executeRun,
  executeSubmission,
  executeCodingJob,
  normalizeOutput,
  bounded,
};
