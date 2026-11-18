"use strict";

const { z } = require("zod");
const { getPrisma } = require("./prisma");
const { effectiveExecutionMode } = require("./coding-problem-config");

const languages = ["Java"];
const terminalSubmissionStatuses = new Set([
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
const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  topic: z.string().trim().max(120).optional(),
  status: z.enum(["Solved", "Attempted", "Unsolved"]).optional(),
  sort: z.enum(["title", "difficulty"]).default("title"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const sheetProgressSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
});

function db() {
  return getPrisma();
}

function problemIdentifierWhere(identifier) {
  return z.string().uuid().safeParse(identifier).success
    ? { id: identifier }
    : { slug: identifier };
}

function publicProblem(problem, progress) {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    executionMode: effectiveExecutionMode(problem),
    statement: problem.statement,
    difficulty: problem.difficulty,
    topics: problem.topics.map(({ topic }) => topic.name),
    languages: problem.languageConfigs
      .filter((config) => config.enabled && config.language === "Java")
      .map(({ language }) => language),
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
    status: progress?.status || "UNSOLVED",
    attempts: progress?.attempts || 0,
    solvedAt: progress?.solvedAt || null,
  };
}

async function studentId(userId) {
  const profile = await db().studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile)
    throw Object.assign(new Error("Student profile was not found."), {
      status: 404,
      code: "STUDENT_PROFILE_NOT_FOUND",
    });
  return profile.id;
}

function parseSource(body) {
  return z
    .object({
      problemId: z.string().uuid(),
      language: z.enum(languages),
      sourceCode: z.string().min(1).max(50_000),
      customInput: z.string().max(10_000).nullable().optional(),
      idempotencyKey: z.string().trim().min(8).max(200).optional(),
    })
    .parse(body);
}

async function executionHealth(_req, res) {
  res.status(503).json({ data: { ready: false, status: "disabled" } });
}

async function listProblems(req, res, next) {
  try {
    const input = listSchema.parse(req.query);
    const where = {
      status: "PUBLISHED",
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { statement: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.topic
        ? {
            topics: {
              some: {
                topic: { name: { equals: input.topic, mode: "insensitive" } },
              },
            },
          }
        : {}),
      ...(input.status === "Unsolved"
        ? { progress: { none: { userId: req.auth.sub } } }
        : {}),
      ...(input.status && input.status !== "Unsolved"
        ? {
            progress: {
              some: {
                userId: req.auth.sub,
                status: input.status.toUpperCase(),
              },
            },
          }
        : {}),
    };
    const prisma = db();
    const [total, problems, profile] = await prisma.$transaction([
      prisma.codingProblem.count({ where }),
      prisma.codingProblem.findMany({
        where,
        include: {
          topics: { include: { topic: true } },
          languageConfigs: { where: { enabled: true } },
        },
        orderBy:
          input.sort === "difficulty"
            ? [{ difficulty: "asc" }, { title: "asc" }]
            : { title: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.user.findUnique({
        where: { id: req.auth.sub },
        select: {
          codingProgress: {
            select: {
              problemId: true,
              status: true,
              attempts: true,
              solvedAt: true,
            },
          },
        },
      }),
    ]);
    const progress = new Map(
      (profile?.codingProgress || []).map((item) => [item.problemId, item]),
    );
    res.json({
      data: {
        items: problems.map((problem) =>
          publicProblem(problem, progress.get(problem.id)),
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
        pages: Math.ceil(total / input.pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listTopics(_req, res, next) {
  try {
    const topics = await db().topic.findMany({
      where: {
        problemTopics: {
          some: { problem: { status: "PUBLISHED" } },
        },
      },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            problemTopics: { where: { problem: { status: "PUBLISHED" } } },
          },
        },
      },
    });
    res.json({
      data: topics.map(({ id, name, _count }) => ({
        id,
        name,
        _count: { problemTopics: _count.problemTopics },
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function getProblem(req, res, next) {
  try {
    const problem = await db().codingProblem.findFirst({
      where: { ...problemIdentifierWhere(req.params.id), status: "PUBLISHED" },
      include: {
        topics: { include: { topic: true } },
        languageConfigs: { where: { enabled: true, language: "Java" } },
        testCases: {
          where: { kind: "PUBLIC", enabled: true },
          orderBy: { sequence: "asc" },
          select: { id: true, sequence: true },
        },
      },
    });
    if (!problem)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Problem not found." } });
    const progress = await db().studentProblemProgress.findUnique({
      where: {
        userId_problemId: { userId: req.auth.sub, problemId: problem.id },
      },
    });
    const functionConfig =
      effectiveExecutionMode(problem) === "FUNCTION_BASED"
        ? {
            functionName: problem.functionName,
            className: problem.className,
            parameterDefinitions: problem.parameterDefinitions,
            returnType: problem.returnType,
            inputSerializationFormat: problem.inputSerializationFormat,
            outputSerializationFormat: problem.outputSerializationFormat,
          }
        : null;
    res.json({
      data: {
        ...publicProblem(problem, progress),
        functionConfig,
        inputFormat: problem.inputFormat || null,
        outputFormat: problem.outputFormat || null,
        constraints: problem.constraints || [],
        examples: problem.examples || [],
        explanation: problem.explanation || null,
        testCaseCount: problem.testCases.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function starterCode(req, res, next) {
  try {
    const input = z.object({ language: z.enum(languages) }).parse(req.query);
    const config = await db().problemLanguageConfig.findFirst({
      where: {
        problem: {
          ...problemIdentifierWhere(req.params.id),
          status: "PUBLISHED",
        },
        language: input.language,
        enabled: true,
      },
      select: { language: true, starterCode: true, functionSignature: true },
    });
    if (!config)
      return res
        .status(404)
        .json({
          error: {
            code: "LANGUAGE_NOT_SUPPORTED",
            message: "That language is not enabled for this problem.",
          },
        });
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
}

async function createRun(_req, res) {
  res.status(503).json({ error: { code: "CODE_EXECUTION_UNAVAILABLE", message: "Code execution is currently unavailable." } });
}

async function createSubmission(_req, res) {
  res.status(503).json({ error: { code: "CODE_EXECUTION_UNAVAILABLE", message: "Code execution is currently unavailable." } });
}

async function getRun(req, res, next) {
  try {
    const run = await db().codeRun.findFirst({
      where: { id: req.params.id, userId: req.auth.sub },
      select: runSelect,
    });
    if (!run)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Run not found." } });
    res.json({ data: safeRunResult(run) });
  } catch (error) {
    next(error);
  }
}

const runSelect = {
  id: true,
  status: true,
  verdict: true,
  executionTimeMs: true,
  memoryKb: true,
  stdout: true,
  stderr: true,
  compileOutput: true,
  perTestResults: true,
  createdAt: true,
  completedAt: true,
};

function safeRunResult(run) {
  const stored =
    run.perTestResults && typeof run.perTestResults === "object"
      ? run.perTestResults
      : {};
  const tests = Array.isArray(stored.tests)
    ? stored.tests
        .filter(
          (item) => item && (item.kind === "PUBLIC" || item.kind === "CUSTOM"),
        )
        .map(
          ({
            sequence,
            kind,
            input,
            expectedOutput,
            stdout,
            stderr,
            compileOutput,
            executionTimeMs,
            memoryKb,
            passed,
            verdict,
          }) => ({
            sequence,
            kind,
            input,
            expectedOutput,
            stdout,
            stderr,
            compileOutput,
            executionTimeMs,
            memoryKb,
            passed,
            verdict,
          }),
        )
    : [];
  return {
    id: run.id,
    status: run.status,
    verdict: run.verdict,
    provider: run.provider,
    executionTimeMs: run.executionTimeMs,
    memoryKb: run.memoryKb,
    stdout: run.stdout,
    stderr: run.stderr,
    compileOutput: run.compileOutput,
    perTestResults: {
      tests,
      totalTests: Number.isInteger(stored.totalTests)
        ? stored.totalTests
        : tests.filter((item) => item.kind === "PUBLIC").length,
      executedTests: Number.isInteger(stored.executedTests)
        ? stored.executedTests
        : tests.length,
      passedTests: Number.isInteger(stored.passedTests)
        ? stored.passedTests
        : tests.filter((item) => item.passed === true).length,
      failedTests: Number.isInteger(stored.failedTests)
        ? stored.failedTests
        : tests.filter((item) => item.passed === false).length,
    },
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

function safeExecutionResult(result) {
  const summary = Array.isArray(result.perTestSummary)
    ? { tests: result.perTestSummary }
    : result.perTestSummary || {};
  const tests = Array.isArray(summary.tests)
    ? summary.tests.map((item) => ({
        sequence: item.sequence,
        kind: item.kind,
        passed: item.passed,
        verdict: item.verdict,
        executionTimeMs: item.executionTimeMs,
        memoryKb: item.memoryKb,
        ...(item.kind === "PUBLIC"
          ? {
              ...(item.stdout === undefined ? {} : { stdout: item.stdout }),
              ...(item.stderr === undefined ? {} : { stderr: item.stderr }),
              ...(item.compileOutput === undefined
                ? {}
                : { compileOutput: item.compileOutput }),
            }
          : {}),
      }))
    : [];
  return {
    id: result.id,
    provider: result.provider,
    passedTests: result.passedTests,
    totalTests: result.totalTests,
    failedTests: Math.max(0, result.totalTests - result.passedTests),
    evaluatedTests: Number.isInteger(summary.evaluatedTests)
      ? summary.evaluatedTests
      : tests.length,
    score: Number.isFinite(summary.score) ? summary.score : null,
    executionTimeMs: result.executionTimeMs,
    memoryKb: result.memoryKb,
    failureCode: result.failureCode,
    perTestSummary: tests,
    ...(summary.publicFeedback
      ? {
          stdout: summary.publicFeedback.stdout || "",
          stderr: summary.publicFeedback.stderr || "",
          compileOutput: summary.publicFeedback.compileOutput || "",
        }
      : {}),
    createdAt: result.createdAt,
  };
}

function safeSubmissionHistoryItem(item) {
  return {
    id: item.id,
    language: item.language,
    status: item.status,
    verdict: item.verdict,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    problem: item.problem,
  };
}

async function getSubmission(req, res, next) {
  try {
    const submission = await db().codeSubmission.findFirst({
      where: { id: req.params.id, userId: req.auth.sub },
      include: {
        executionResults: { orderBy: { createdAt: "desc" }, take: 1 },
        problem: { select: { title: true, slug: true } },
      },
    });
    if (!submission)
      return res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "Submission not found." },
        });
    res.json({
      data: {
        id: submission.id,
        language: submission.language,
        status: submission.status,
        verdict: submission.verdict,
        attemptCount: submission.attemptCount,
        queuedAt: submission.queuedAt,
        startedAt: submission.startedAt,
        completedAt: submission.completedAt,
        createdAt: submission.createdAt,
        problem: submission.problem,
        executionResults: submission.executionResults.map(safeExecutionResult),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
        problemId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const { page, pageSize } = input;
    const where = {
      userId: req.auth.sub,
      ...(input.problemId ? { problemId: input.problemId } : {}),
    };
    const [total, items] = await db().$transaction([
      db().codeSubmission.count({ where }),
      db().codeSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          language: true,
          status: true,
          verdict: true,
          createdAt: true,
          completedAt: true,
          problem: {
            select: { id: true, slug: true, title: true, difficulty: true },
          },
        },
      }),
    ]);
    res.json({
      data: {
        items: items.map(safeSubmissionHistoryItem),
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function stats(req, res, next) {
  try {
    const items = await db().studentProblemProgress.findMany({
      where: { userId: req.auth.sub },
      include: { problem: { select: { difficulty: true } } },
    });
    const submissions = await db().codeSubmission.count({
      where: { userId: req.auth.sub },
    });
    const solved = items.filter((item) => item.status === "SOLVED");
    const byDifficulty = Object.fromEntries(
      ["Easy", "Medium", "Hard"].map((difficulty) => [
        difficulty,
        solved.filter((item) => item.problem.difficulty === difficulty).length,
      ]),
    );
    res.json({
      data: {
        totalSolved: solved.length,
        totalSubmissions: submissions,
        acceptanceRate: submissions
          ? Math.round((solved.length / submissions) * 100)
          : 0,
        byDifficulty,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listSheets(req, res, next) {
  try {
    const sheets = await db().sheet.findMany({
      where: { subject: { status: "PUBLISHED" } },
      orderBy: { name: "asc" },
      include: {
        subject: {
          include: {
            topics: {
              orderBy: { name: "asc" },
              include: {
                sheetProblems: {
                  orderBy: { title: "asc" },
                  include: {
                    progress: {
                      where: { userId: req.auth.sub },
                      select: { status: true, completedAt: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const items = sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      description: sheet.description,
      source: sheet.source,
      topics: sheet.subject.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        problems: topic.sheetProblems.map((problem) => {
          const storedStatus = problem.progress[0]?.status;
          return {
            id: problem.id,
            title: problem.title,
            difficulty: problem.difficulty,
            platform: problem.platform,
            url: problem.url,
            status:
              ({
                SOLVED: "COMPLETED",
                ATTEMPTED: "IN_PROGRESS",
                REVISION_REQUIRED: "IN_PROGRESS",
              })[storedStatus] || storedStatus || "NOT_STARTED",
            completedAt: problem.progress[0]?.completedAt || null,
          };
        }),
      })),
    }));
    const problems = items.flatMap((sheet) =>
      sheet.topics.flatMap((topic) => topic.problems),
    );
    res.json({
      data: {
        items,
        stats: {
          total: problems.length,
          completed: problems.filter((problem) => problem.status === "COMPLETED").length,
          inProgress: problems.filter((problem) => problem.status === "IN_PROGRESS").length,
          notStarted: problems.filter((problem) => problem.status === "NOT_STARTED").length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateSheetProgress(req, res, next) {
  try {
    const input = sheetProgressSchema.parse(req.body);
    const status = {
      NOT_STARTED: "NOT_STARTED",
      IN_PROGRESS: "ATTEMPTED",
      COMPLETED: "SOLVED",
    }[input.status];
    const problem = await db().problem.findFirst({
      where: {
        id: req.params.id,
        topic: { subject: { status: "PUBLISHED", sheet: { isNot: null } } },
      },
      select: { id: true, topicId: true },
    });
    if (!problem) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Placement-sheet problem not found.",
        },
      });
    }
    const progress = await db().$transaction(async (tx) => {
      const where = {
        userId_problemId: { userId: req.auth.sub, problemId: problem.id },
      };
      const previous = await tx.sheetProblemProgress.findUnique({ where });
      if (previous?.status === status) return { ...previous, status: input.status };
      const enteringAttempted =
        ["ATTEMPTED", "SOLVED"].includes(status) &&
        !["ATTEMPTED", "SOLVED", "REVISION_REQUIRED"].includes(previous?.status);
      const now = new Date();
      const updated = await tx.sheetProblemProgress.upsert({
        where,
        create: {
          userId: req.auth.sub,
          problemId: problem.id,
          status,
          attempts: enteringAttempted ? 1 : 0,
          solvedAt: status === "SOLVED" ? now : null,
          completedAt: status === "SOLVED" ? now : null,
        },
        update: {
          status,
          attempts: enteringAttempted ? { increment: 1 } : undefined,
          solvedAt: status === "SOLVED" ? previous?.solvedAt || now : previous?.solvedAt,
          completedAt:
            status === "SOLVED" ? previous?.completedAt || now : previous?.completedAt,
        },
      });
      const profile = await tx.studentProfile.findUnique({
        where: { userId: req.auth.sub },
        select: { id: true },
      });
      if (profile) {
        await tx.studentActivity.create({
          data: {
            studentProfileId: profile.id,
            activityType: "CODING_SHEET_PROGRESS",
            topicId: problem.topicId,
            sourceId: problem.id,
            metadata: { status: input.status },
          },
        });
      }
      return { ...updated, status: input.status };
    });
    res.json({ data: progress });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  executionHealth,
  listProblems,
  listTopics,
  getProblem,
  starterCode,
  createRun,
  createSubmission,
  getRun,
  getSubmission,
  history,
  stats,
  listSheets,
  updateSheetProgress,
  languages,
  problemIdentifierWhere,
  safeExecutionResult,
  safeSubmissionHistoryItem,
  safeRunResult,
};
