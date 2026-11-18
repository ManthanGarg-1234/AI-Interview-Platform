"use strict";

const { Worker } = require("bullmq");
const { getPrisma } = require("./prisma");
const { scoreFor } = require("./contests");
const storage = require("./private-storage");
const { redisConnection } = require("./coding-queue");
const { submitAndPoll, configuration: judge0Configuration } = require("./judge0");

const terminalStatuses = new Set(["COMPLETED", "FAILED"]);
const outputLimit = 100_000;

function bounded(value) {
  return String(value || "").slice(0, outputLimit);
}

function normalizeOutput(value) {
  return bounded(value).replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

function transitionNote(verdict) {
  return `Judge0 verdict: ${verdict}.`;
}

async function setRunFailed(prisma, runId, error) {
  await prisma.codeRun.updateMany({
    where: { id: runId, status: { not: "COMPLETED" } },
    data: { status: "FAILED", verdict: "INTERNAL_ERROR", stderr: bounded(error.message), completedAt: new Date() },
  });
}

async function executeRun(prisma, runId) {
  const run = await prisma.codeRun.findUnique({ where: { id: runId }, include: { problem: { select: { timeLimitMs: true, memoryLimitKb: true } } } });
  if (!run || terminalStatuses.has(run.status)) return;
  await prisma.codeRun.update({ where: { id: run.id }, data: { status: "RUNNING", provider: "judge0" } });
  try {
    const result = await submitAndPoll({ language: run.language, sourceCode: run.sourceCode, stdin: run.customInput || "", cpuTimeLimitMs: run.problem.timeLimitMs, memoryLimitKb: run.problem.memoryLimitKb });
    await prisma.codeRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", verdict: result.verdict, executionTimeMs: result.executionTimeMs, memoryKb: result.memoryKb, stdout: bounded(result.stdout), stderr: bounded(result.stderr), compileOutput: bounded(result.compileOutput), completedAt: new Date() },
    });
  } catch (error) {
    if (error.retryable) throw error;
    await setRunFailed(prisma, run.id, error);
    throw error;
  }
}

async function readTestCase(testCase) {
  let input;
  let expected;
  try {
    [input, expected] = await Promise.all([storage.get(testCase.inputRef), storage.get(testCase.expectedOutputRef)]);
  } catch (error) {
    throw Object.assign(new Error(`Test case storage could not be loaded: ${error.message}`), { code: "TEST_CASE_STORAGE_UNAVAILABLE" });
  }
  return { input: input.toString("utf8"), expected: expected.toString("utf8") };
}

async function executeSubmission(prisma, submissionId) {
  const submission = await prisma.codeSubmission.findUnique({
    where: { id: submissionId },
    include: { problem: { include: { testCases: { where: { enabled: true }, orderBy: { sequence: "asc" } } } }, contestSubmission: { include: { contest: true, problem: true } } },
  });
  if (!submission || terminalStatuses.has(submission.status)) return;
  await prisma.codeSubmission.update({ where: { id: submission.id }, data: { status: "RUNNING", startedAt: new Date(), attemptCount: { increment: 1 } } });
  await prisma.submissionStatusHistory.create({ data: { submissionId: submission.id, fromStatus: "QUEUED", toStatus: "RUNNING" } });
  const summaries = [];
  let finalVerdict = "INTERNAL_ERROR";
  let totalTime = 0;
  let maxMemory = 0;
  const publicFeedback = { stdout: "", stderr: "", compileOutput: "" };
  try {
    if (submission.problem.testCases.length === 0) {
      await prisma.$transaction(async (tx) => {
        await tx.executionResult.create({ data: { submissionId: submission.id, provider: "judge0", passedTests: 0, totalTests: 0, executionTimeMs: 0, memoryKb: null, failureCode: "NO_ENABLED_TEST_CASES", perTestSummary: [] } });
        await tx.codeSubmission.update({ where: { id: submission.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", completedAt: new Date() } });
        await tx.submissionStatusHistory.create({ data: { submissionId: submission.id, fromStatus: "RUNNING", toStatus: "FAILED", note: "No enabled test cases are configured for this problem." } });
      });
      return;
    }
    for (const testCase of submission.problem.testCases) {
      const test = await readTestCase(testCase);
      const result = await submitAndPoll({ language: submission.language, sourceCode: submission.sourceCode, stdin: test.input, cpuTimeLimitMs: submission.problem.timeLimitMs, memoryLimitKb: submission.problem.memoryLimitKb });
      totalTime += result.executionTimeMs || 0;
      maxMemory = Math.max(maxMemory, result.memoryKb || 0);
      if (testCase.kind === "PUBLIC") {
        publicFeedback.stdout = bounded(result.stdout);
        publicFeedback.stderr = bounded(result.stderr);
        publicFeedback.compileOutput = bounded(result.compileOutput);
      }
      const passed = result.verdict === "ACCEPTED" && normalizeOutput(result.stdout) === normalizeOutput(test.expected);
      const verdict = passed ? "ACCEPTED" : result.verdict === "ACCEPTED" ? "WRONG_ANSWER" : result.verdict;
      summaries.push({ sequence: testCase.sequence, kind: testCase.kind, passed, verdict, executionTimeMs: result.executionTimeMs, memoryKb: result.memoryKb });
      if (!passed) {
        finalVerdict = verdict;
        break;
      }
    }
    if (summaries.length === submission.problem.testCases.length && summaries.every((item) => item.passed)) finalVerdict = "ACCEPTED";
    const passedTests = summaries.filter((item) => item.passed).length;
    const accepted = finalVerdict === "ACCEPTED" && passedTests === submission.problem.testCases.length && submission.problem.testCases.length > 0;
    const status = accepted ? "COMPLETED" : "FAILED";
    await prisma.$transaction(async (tx) => {
      await tx.executionResult.create({ data: { submissionId: submission.id, provider: "judge0", providerRequestId: null, passedTests, totalTests: submission.problem.testCases.length, executionTimeMs: totalTime, memoryKb: maxMemory || null, stdout: publicFeedback.stdout, stderr: publicFeedback.stderr, compileOutput: publicFeedback.compileOutput, failureCode: accepted ? null : finalVerdict, perTestSummary: { tests: summaries, publicFeedback } } });
      await tx.codeSubmission.update({ where: { id: submission.id }, data: { status, verdict: finalVerdict, completedAt: new Date() } });
      await tx.submissionStatusHistory.create({ data: { submissionId: submission.id, fromStatus: "RUNNING", toStatus: status, note: transitionNote(finalVerdict) } });
      if (submission.type === "CONTEST" && submission.contestSubmission) {
        const contest = submission.contestSubmission;
        const wrongCount = await tx.contestSubmission.count({ where: { contestId: contest.contestId, userId: submission.userId, problemId: submission.problemId, solved: false } });
        const priorWrong = accepted ? Math.max(0, wrongCount - 1) : wrongCount;
        await tx.contestSubmission.update({ where: { id: contest.id }, data: { solved: accepted, wrongAttempts: priorWrong, score: accepted ? scoreFor({ points: contest.problem.points, penaltyPerWrong: contest.problem.penaltyPerWrong }, priorWrong) : 0 } });
      } else if (accepted) {
        await tx.studentProblemProgress.update({ where: { userId_problemId: { userId: submission.userId, problemId: submission.problemId } }, data: { status: "SOLVED", solvedAt: new Date() } });
      }
    });
  } catch (error) {
    if (error.retryable) {
      await prisma.codeSubmission.update({ where: { id: submission.id }, data: { status: "QUEUED", startedAt: null } });
      throw error;
    }
    await prisma.$transaction(async (tx) => {
      await tx.executionResult.create({ data: { submissionId: submission.id, provider: "judge0", passedTests: summaries.filter((item) => item.passed).length, totalTests: submission.problem.testCases.length, executionTimeMs: totalTime, memoryKb: maxMemory || null, failureCode: error.code || "INTERNAL_ERROR", perTestSummary: { tests: summaries, publicFeedback } } });
      await tx.codeSubmission.update({ where: { id: submission.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", completedAt: new Date() } });
      await tx.submissionStatusHistory.create({ data: { submissionId: submission.id, fromStatus: "RUNNING", toStatus: "FAILED", note: error.message.slice(0, 500) } });
    });
    throw error;
  }
}

function startCodingWorker() {
  judge0Configuration();
  const worker = new Worker("coding-execution", async (job) => {
    const prisma = getPrisma();
    if (job.data.kind === "run") return executeRun(prisma, job.data.id);
    if (job.data.kind === "submission") return executeSubmission(prisma, job.data.id);
    throw new Error("Unknown coding execution job.");
  }, { connection: redisConnection(), concurrency: Math.max(1, Number(process.env.CODING_WORKER_CONCURRENCY || 2)) });
  worker.on("failed", async (job, error) => {
    console.error(`Coding job ${job?.id || "unknown"} failed: ${error.message}`);
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    const prisma = getPrisma();
    if (job.data.kind === "run") return setRunFailed(prisma, job.data.id, error);
    if (job.data.kind === "submission") {
      await prisma.$transaction(async (tx) => {
        const submission = await tx.codeSubmission.findUnique({ where: { id: job.data.id }, select: { status: true } });
        if (!submission || terminalStatuses.has(submission.status)) return;
        await tx.codeSubmission.update({ where: { id: job.data.id }, data: { status: "FAILED", verdict: "INTERNAL_ERROR", completedAt: new Date() } });
        await tx.submissionStatusHistory.create({ data: { submissionId: job.data.id, fromStatus: submission.status, toStatus: "FAILED", note: error.message.slice(0, 500) } });
      });
    }
  });
  return worker;
}

if (require.main === module) {
  startCodingWorker();
  console.log("Coding execution worker started.");
}

module.exports = { startCodingWorker, executeRun, executeSubmission, normalizeOutput, bounded };
