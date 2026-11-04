"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const languageTemplates = {
  Java: "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    // Read from stdin and write the answer to stdout.\n  }\n}",
  "C++": "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  // Read from stdin and write the answer to stdout.\n}",
  Python: "import sys\n\n# Read from stdin and write the answer to stdout.\n",
  JavaScript: "'use strict';\n\n// Read from stdin and write the answer to stdout.\n",
};

async function main() {
  const problems = [
    { slug: "pair-with-target-sum", title: "Pair With Target Sum", difficulty: "Easy", statement: "Read an integer array and target, then print the indexes of two distinct values whose sum equals the target.", inputFormat: "n, followed by n integers, followed by target.", outputFormat: "Print two zero-based indexes.", constraints: ["2 <= n <= 100000", "Exactly one answer exists."], examples: [{ input: "4\\n2 7 11 15\\n9\\n", output: "0 1\\n" }] },
    { slug: "balanced-brackets", title: "Balanced Brackets", difficulty: "Easy", statement: "Print YES when every opening bracket in the input has a correctly ordered closing bracket; otherwise print NO.", inputFormat: "One line containing brackets.", outputFormat: "Print YES or NO.", constraints: ["1 <= length <= 100000"], examples: [{ input: "({[]})\\n", output: "YES\\n" }] },
  ];
  for (const definition of problems) {
    const problem = await prisma.codingProblem.upsert({ where: { slug: definition.slug }, update: { ...definition, status: "PUBLISHED" }, create: { ...definition, status: "PUBLISHED" } });
    for (const [language, starterCode] of Object.entries(languageTemplates)) {
      await prisma.problemLanguageConfig.upsert({ where: { problemId_language: { problemId: problem.id, language } }, update: { starterCode, enabled: true }, create: { problemId: problem.id, language, starterCode } });
    }
  }
}

main().finally(() => prisma.$disconnect());
