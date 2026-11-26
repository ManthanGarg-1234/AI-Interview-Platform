import { Prisma, PrismaClient } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { sheetSchema } from "./sheet-schema";

const prisma = new PrismaClient();
const languageTemplates: Record<string, string> = {
  Java: "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    // Read from stdin and write the answer to stdout.\n  }\n}",
  "C++": "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  // Read from stdin and write the answer to stdout.\n}",
  Python: "import sys\n\n# Read from stdin and write the answer to stdout.\n",
  JavaScript: "'use strict';\n\n// Read from stdin and write the answer to stdout.\n",
};

const codingProblems = [
  {
    slug: "pair-with-target-sum",
    title: "Pair With Target Sum",
    difficulty: "Easy",
    statement: "Read an integer array and target, then print the indexes of two distinct values whose sum equals the target.",
    inputFormat: "n, followed by n integers, followed by target.",
    outputFormat: "Print two zero-based indexes.",
    constraints: ["2 <= n <= 100000", "Exactly one answer exists."],
    examples: [{ input: "4\n2 7 11 15\n9\n", output: "0 1\n" }],
  },
  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    difficulty: "Easy",
    statement: "Print YES when every opening bracket in the input has a correctly ordered closing bracket; otherwise print NO.",
    inputFormat: "One line containing brackets.",
    outputFormat: "Print YES or NO.",
    constraints: ["1 <= length <= 100000"],
    examples: [{ input: "({[]})\n", output: "YES\n" }],
  },
];

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableSlug(value: string): string {
  const suffix = createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 8);
  return `${slugify(value) || "item"}-${suffix}`;
}

function normalizedPlatform(value: string): string {
  return value === "CODINGNINJAS" ? "CODE360" : value;
}

function problemUrls(value: string, platform: string): { url: string; canonicalUrl: string } {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const localSuffixes = [".localhost", ".local", ".internal", ".test", ".invalid", ".example"];
  if (url.protocol !== "https:" || url.username || url.password || !hostname.includes(".") || isIP(hostname)
    || hostname === "localhost" || hostname === "localhost.localdomain" || localSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error(`Unsafe coding problem URL: ${value}`);
  }
  const hosts: Record<string, string[]> = {
    LEETCODE: ["leetcode.com"],
    GFG: ["geeksforgeeks.org"],
    CODE360: ["code360.in", "codingninjas.com"],
    HACKERRANK: ["hackerrank.com"],
    CODECHEF: ["codechef.com"],
    INTERVIEWBIT: ["interviewbit.com"],
    CODEFORCES: ["codeforces.com"],
  };
  const allowed = hosts[platform];
  if (allowed && !allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(`URL host ${url.hostname} does not match platform ${platform}.`);
  }
  url.search = "";
  url.hash = "";
  const canonicalPath = url.pathname.replace(/\/+$/, "") || "/";
  const canonicalUrl = `${url.origin.toLowerCase()}${canonicalPath}`;
  if (platform === "LEETCODE" && canonicalPath !== "/") url.pathname = `${canonicalPath}/`;
  else url.pathname = canonicalPath;
  return { url: url.href, canonicalUrl };
}

async function codingTopic(tx: Prisma.TransactionClient, name: string) {
  const slug = stableSlug(name);
  return tx.codingTopic.upsert({
    where: { name },
    update: { slug, category: "DSA" },
    create: { name, slug, category: "DSA" },
  });
}

async function seedCodingProblems(): Promise<void> {
  for (const definition of codingProblems) {
    const problem = await prisma.codingProblem.upsert({
      where: { slug: definition.slug },
      update: { ...definition, status: "PUBLISHED" },
      create: { ...definition, status: "PUBLISHED" },
    });

    for (const [language, starterCode] of Object.entries(languageTemplates)) {
      await prisma.problemLanguageConfig.upsert({
        where: { problemId_language: { problemId: problem.id, language } },
        update: { starterCode, enabled: true },
        create: { problemId: problem.id, language, starterCode },
      });
    }
  }
}

async function readSheets(): Promise<Array<{ fileName: string; data: ReturnType<typeof sheetSchema.parse> }>> {
  const directory = path.resolve(__dirname, "data", "sheets");
  const fileNames = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const sheets = [];

  for (const fileName of fileNames) {
    const json: unknown = JSON.parse(await readFile(path.join(directory, fileName), "utf8"));
    sheets.push({ fileName, data: sheetSchema.parse(json) });
  }

  return sheets;
}

async function seedSheets(): Promise<void> {
  const sheets = await readSheets();
  const counts = {
    sheets: { created: 0, updated: 0 },
    topics: { created: 0, updated: 0 },
    problems: { created: 0, updated: 0, canonicalized: 0 },
    associations: 0,
  };

  for (const { data } of sheets) {
    const sheetCounts = await prisma.$transaction(async (tx) => {
      const localCounts = { sheetCreated: false, topicCreated: 0, topicUpdated: 0, problemCreated: 0, problemUpdated: 0, canonicalized: 0, associations: 0 };
      const existingSheet = await tx.sheet.findUnique({ where: { name: data.name } });
      const subjectSlug = `sheet-${slugify(data.name)}`;
      const subject = existingSheet
        ? await tx.subject.findUniqueOrThrow({ where: { id: existingSheet.subjectId } })
        : await tx.subject.upsert({
            where: { slug: subjectSlug },
            update: { name: data.name },
            create: { name: data.name, slug: subjectSlug },
          });

      const sheet = await tx.sheet.upsert({
        where: { name: data.name },
        update: {
          slug: stableSlug(data.name),
          description: data.description,
          source: data.source,
          category: data.category,
          estimatedMinutes: data.estimatedMinutes,
          status: "PUBLISHED",
        },
        create: {
          name: data.name,
          slug: stableSlug(data.name),
          description: data.description,
          source: data.source,
          category: data.category,
          estimatedMinutes: data.estimatedMinutes,
          status: "PUBLISHED",
          subjectId: subject.id,
        },
      });
      localCounts.sheetCreated = !existingSheet;
      await tx.sheetProblem.updateMany({ where: { sheetId: sheet.id }, data: { sequence: { increment: 1_000_000 } } });
      let sequence = 1;

      for (const topicData of data.topics) {
        const topicSlug = slugify(topicData.name);
        const existingTopic = await tx.topic.findUnique({
          where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
        });
        const topic = await tx.topic.upsert({
          where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
          update: { name: topicData.name },
          create: { subjectId: subject.id, name: topicData.name, slug: topicSlug },
        });
        if (existingTopic) localCounts.topicUpdated += 1;
        else localCounts.topicCreated += 1;
        const catalogTopic = await codingTopic(tx, topicData.name);

        for (const problemData of topicData.problems) {
          const platform = normalizedPlatform(problemData.platform);
          const { url, canonicalUrl } = problemUrls(problemData.url, platform);
          const existingProblem = await tx.problem.findUnique({ where: { canonicalUrl } });
          const problem = await tx.problem.upsert({
            where: { canonicalUrl },
            update: {
              slug: stableSlug(`${problemData.title}-${canonicalUrl}`),
              title: problemData.title,
              difficulty: problemData.difficulty,
              platform,
              url,
              summary: problemData.summary,
              subtopic: problemData.subtopic,
              attribution: problemData.attribution || `${platform} problem link; metadata independently curated`,
              placementPriority: problemData.placementPriority,
              estimatedMinutes: problemData.estimatedMinutes,
              status: "PUBLISHED",
            },
            create: {
              slug: stableSlug(`${problemData.title}-${canonicalUrl}`),
              topicId: topic.id,
              title: problemData.title,
              summary: problemData.summary,
              subtopic: problemData.subtopic,
              difficulty: problemData.difficulty,
              platform,
              url,
              canonicalUrl,
              attribution: problemData.attribution || `${platform} problem link; metadata independently curated`,
              placementPriority: problemData.placementPriority,
              estimatedMinutes: problemData.estimatedMinutes,
              status: "PUBLISHED",
            },
          });
          for (const patternName of problemData.patterns) {
            const pattern = await tx.codingPattern.upsert({
              where: { name: patternName },
              update: { slug: stableSlug(patternName) },
              create: { name: patternName, slug: stableSlug(patternName) },
            });
            await tx.codingProblemPattern.upsert({
              where: { problemId_patternId: { problemId: problem.id, patternId: pattern.id } },
              update: {},
              create: { problemId: problem.id, patternId: pattern.id },
            });
          }
          await tx.codingProblemTopic.upsert({
            where: { problemId_topicId: { problemId: problem.id, topicId: catalogTopic.id } },
            update: {},
            create: { problemId: problem.id, topicId: catalogTopic.id, isPrimary: true },
          });
          await tx.sheetProblem.upsert({
            where: { sheetId_problemId: { sheetId: sheet.id, problemId: problem.id } },
            update: { topicId: catalogTopic.id, sequence },
            create: { sheetId: sheet.id, problemId: problem.id, topicId: catalogTopic.id, sequence },
          });
          sequence += 1;
          if (existingProblem) localCounts.problemUpdated += 1;
          else localCounts.problemCreated += 1;
          if (existingProblem) localCounts.canonicalized += 1;
          localCounts.associations += 1;
        }
      }

      const unseededAssociations = await tx.sheetProblem.findMany({
        where: { sheetId: sheet.id, sequence: { gt: sequence - 1 } },
        orderBy: { sequence: "asc" },
        select: { problemId: true },
      });
      for (const [index, association] of unseededAssociations.entries()) {
        await tx.sheetProblem.update({
          where: { sheetId_problemId: { sheetId: sheet.id, problemId: association.problemId } },
          data: { sequence: sequence + index },
        });
      }
      return localCounts;
    });

    counts.sheets[sheetCounts.sheetCreated ? "created" : "updated"] += 1;
    counts.topics.created += sheetCounts.topicCreated;
    counts.topics.updated += sheetCounts.topicUpdated;
    counts.problems.created += sheetCounts.problemCreated;
    counts.problems.updated += sheetCounts.problemUpdated;
    counts.problems.canonicalized += sheetCounts.canonicalized;
    counts.associations += sheetCounts.associations;
  }

  console.log(
    `Seed summary: sheets ${counts.sheets.created} created/${counts.sheets.updated} updated; ` +
    `topics ${counts.topics.created} created/${counts.topics.updated} updated; ` +
    `problems ${counts.problems.created} created/${counts.problems.updated} updated (${counts.problems.canonicalized} cross-sheet associations); ` +
    `${counts.associations} sheet/problem associations.`,
  );
}

async function seedPreparationSubjects(): Promise<void> {
  const catalogue = [
    ["DSA", "dsa"], ["DBMS", "dbms"], ["Operating Systems", "operating-systems"],
    ["Computer Networks", "computer-networks"], ["OOP", "oop"], ["Java", "java"],
    ["C/C++", "c-cpp"], ["Python", "python"], ["Web Development", "web-development"],
    ["System Design", "system-design"], ["Aptitude", "aptitude"],
    ["Logical Reasoning", "logical-reasoning"], ["Communication Skills", "communication-skills"],
  ];
  for (const [name, slug] of catalogue) {
    await prisma.subject.upsert({ where: { slug }, update: { name, status: "PUBLISHED" }, create: { name, slug, status: "PUBLISHED" } });
  }
}

async function main(): Promise<void> {
  try {
    await seedCodingProblems();
    await seedSheets();
    await seedPreparationSubjects();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Database seed failed:", error);
  process.exitCode = 1;
});
