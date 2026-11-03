"use strict";

const problems = [
  {
    id: "sum-pair",
    title: "Pair With Target Sum",
    slug: "pair-with-target-sum",
    difficulty: "Easy",
    topics: ["Arrays", "Hashing"],
    language: "Java",
    format: "full-program",
    description: "Read an integer array and target, then print the indexes of two distinct values whose sum equals the target.",
    examples: [{ input: "4\n2 7 11 15\n9\n", output: "0 1\n" }],
    constraints: ["2 <= n <= 100000", "Exactly one answer exists."],
    starterCode: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Read input from standard input and print two zero-based indexes.\n    }\n}",
    publicTests: [{ input: "4\n2 7 11 15\n9\n", output: "0 1\n" }],
    hiddenTests: [{ input: "5\n3 2 4 8 1\n6\n", output: "1 2\n" }, { input: "2\n5 5\n10\n", output: "0 1\n" }],
    timeLimitMs: 2000,
    memoryLimitKb: 128000,
    status: "published"
  },
  {
    id: "balanced-brackets",
    title: "Balanced Brackets",
    slug: "balanced-brackets",
    difficulty: "Easy",
    topics: ["Strings", "Stacks and Queues"],
    language: "Java",
    format: "full-program",
    description: "Print YES when every opening bracket in the input has a correctly ordered closing bracket; otherwise print NO.",
    examples: [{ input: "({[]})\n", output: "YES\n" }, { input: "([)]\n", output: "NO\n" }],
    constraints: ["1 <= input length <= 100000", "The input contains only bracket characters."],
    starterCode: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Read one line and print YES or NO.\n    }\n}",
    publicTests: [{ input: "({[]})\n", output: "YES\n" }, { input: "([)]\n", output: "NO\n" }],
    hiddenTests: [{ input: "()[]{}\n", output: "YES\n" }, { input: "((\n", output: "NO\n" }],
    timeLimitMs: 2000,
    memoryLimitKb: 128000,
    status: "published"
  }
];

function listProblems(query = {}) {
  const search = String(query.search || "").toLowerCase();
  return problems.filter((problem) => problem.status === "published" &&
    (!search || `${problem.title} ${problem.topics.join(" ")}`.toLowerCase().includes(search)) &&
    (!query.difficulty || problem.difficulty === query.difficulty) &&
    (!query.topic || problem.topics.includes(query.topic)));
}

function getProblem(id) {
  return problems.find((problem) => problem.id === id && problem.status === "published") || null;
}

module.exports = { problems, listProblems, getProblem };
