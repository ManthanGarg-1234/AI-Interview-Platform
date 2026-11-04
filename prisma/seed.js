"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const languageTemplates = {
  Java: "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    // Read from stdin and write the answer to stdout.\n  }\n}",
  "C++": "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  // Read from stdin and write the answer to stdout.\n}",
  Python: "import sys\n\n# Read from stdin and write the answer to stdout.\n",
  JavaScript: "'use strict';\n\n// Read from stdin and write the answer to stdout.\n",
};

const SUBJECTS = [
  {
    name: "Data Structures & Algorithms",
    slug: "dsa",
    topics: [
      { name: "Arrays", slug: "arrays" },
      { name: "Strings", slug: "strings" },
      { name: "Binary Search", slug: "binary-search" },
      { name: "Sorting", slug: "sorting" },
      { name: "Hashing", slug: "hashing" },
      { name: "Linked Lists", slug: "linked-lists" },
      { name: "Recursion & Backtracking", slug: "recursion-backtracking" },
      { name: "Bit Manipulation", slug: "bit-manipulation" },
      { name: "Stack & Queue", slug: "stack-queue" },
      { name: "Sliding Window & Two Pointers", slug: "sliding-window-two-pointers" },
      { name: "Greedy", slug: "greedy" },
      { name: "Trees & BST", slug: "trees-bst" },
      { name: "Heaps & Priority Queues", slug: "heaps-priority-queues" },
      { name: "Graphs", slug: "graphs" },
      { name: "Dynamic Programming", slug: "dynamic-programming" },
      { name: "Tries", slug: "tries" },
    ],
  },
  {
    name: "Web Development",
    slug: "web-development",
    topics: [
      { name: "HTML & CSS Fundamentals", slug: "html-css" },
      { name: "JavaScript Essentials", slug: "javascript-essentials" },
      { name: "React.js", slug: "react" },
      { name: "Node.js & Express", slug: "nodejs-express" },
      { name: "REST APIs", slug: "rest-apis" },
      { name: "Databases & SQL", slug: "databases-sql" },
      { name: "Authentication & Security", slug: "auth-security" },
      { name: "System Design for Web", slug: "system-design-web" },
    ],
  },
  {
    name: "Computer Networks",
    slug: "computer-networks",
    topics: [
      { name: "OSI & TCP/IP Model", slug: "osi-tcpip" },
      { name: "IP Addressing & Subnetting", slug: "ip-subnetting" },
      { name: "DNS, HTTP & HTTPS", slug: "dns-http" },
      { name: "TCP vs UDP", slug: "tcp-udp" },
      { name: "Routing & Switching", slug: "routing-switching" },
      { name: "Network Security", slug: "network-security" },
      { name: "Socket Programming", slug: "socket-programming" },
    ],
  },
  {
    name: "Operating Systems",
    slug: "operating-systems",
    topics: [
      { name: "Processes & Threads", slug: "processes-threads" },
      { name: "CPU Scheduling", slug: "cpu-scheduling" },
      { name: "Memory Management", slug: "memory-management" },
      { name: "Deadlocks", slug: "deadlocks" },
      { name: "File Systems", slug: "file-systems" },
      { name: "Synchronization", slug: "synchronization" },
      { name: "Virtual Memory", slug: "virtual-memory" },
    ],
  },
  {
    name: "Linux",
    slug: "linux",
    topics: [
      { name: "Linux Basics & Shell", slug: "linux-basics-shell" },
      { name: "File System & Permissions", slug: "file-system-permissions" },
      { name: "Process Management", slug: "process-management" },
      { name: "Shell Scripting", slug: "shell-scripting" },
      { name: "Networking Commands", slug: "networking-commands" },
    ],
  },
  {
    name: "DBMS",
    slug: "dbms",
    topics: [
      { name: "ER Model & Relational Model", slug: "er-relational-model" },
      { name: "Normalization", slug: "normalization" },
      { name: "Transactions & ACID", slug: "transactions-acid" },
      { name: "Indexing & Query Optimization", slug: "indexing-query-optimization" },
      { name: "Concurrency Control", slug: "concurrency-control" },
    ],
  },
  {
    name: "SQL",
    slug: "sql",
    topics: [
      { name: "SQL Basics & DDL/DML", slug: "sql-basics" },
      { name: "Joins & Subqueries", slug: "joins-subqueries" },
      { name: "Aggregations & Group By", slug: "aggregations-group-by" },
      { name: "Window Functions", slug: "window-functions" },
      { name: "Stored Procedures & Triggers", slug: "stored-procedures-triggers" },
    ],
  },
  {
    name: "System Design",
    slug: "system-design",
    topics: [
      { name: "Design Principles & Scalability", slug: "design-principles" },
      { name: "Load Balancing & Caching", slug: "load-balancing-caching" },
      { name: "Databases: SQL vs NoSQL", slug: "sql-vs-nosql" },
      { name: "Microservices Architecture", slug: "microservices" },
      { name: "Message Queues", slug: "message-queues" },
      { name: "Case Studies", slug: "case-studies" },
    ],
  },
  {
    name: "Object-Oriented Programming",
    slug: "oop",
    topics: [
      { name: "OOP Principles", slug: "oop-principles" },
      { name: "Classes & Objects", slug: "classes-objects" },
      { name: "Inheritance & Polymorphism", slug: "inheritance-polymorphism" },
      { name: "Abstraction & Encapsulation", slug: "abstraction-encapsulation" },
      { name: "Design Patterns", slug: "design-patterns" },
      { name: "SOLID Principles", slug: "solid-principles" },
    ],
  },
  {
    name: "Java Programming",
    slug: "java",
    topics: [
      { name: "Java Basics & Syntax", slug: "java-basics" },
      { name: "Collections Framework", slug: "collections-framework" },
      { name: "Exception Handling", slug: "exception-handling" },
      { name: "Multithreading & Concurrency", slug: "multithreading" },
      { name: "Java 8+ Features", slug: "java-8-features" },
      { name: "Spring Boot Basics", slug: "spring-boot-basics" },
    ],
  },
  {
    name: "Aptitude & Logical Reasoning",
    slug: "aptitude",
    topics: [
      { name: "Quantitative Aptitude", slug: "quantitative-aptitude" },
      { name: "Logical Reasoning", slug: "logical-reasoning" },
      { name: "Data Interpretation", slug: "data-interpretation" },
      { name: "Verbal Reasoning", slug: "verbal-reasoning" },
    ],
  },
  {
    name: "Verbal & Communication",
    slug: "communication",
    topics: [
      { name: "Vocabulary & Grammar", slug: "vocabulary-grammar" },
      { name: "Reading Comprehension", slug: "reading-comprehension" },
      { name: "Professional Communication", slug: "professional-communication" },
      { name: "Email & Documentation", slug: "email-documentation" },
    ],
  },
  {
    name: "HR & Behavioral Interviews",
    slug: "hr",
    topics: [
      { name: "Tell Me About Yourself", slug: "tell-me-about-yourself" },
      { name: "Behavioral Questions (STAR)", slug: "behavioral-star" },
      { name: "Strengths & Weaknesses", slug: "strengths-weaknesses" },
      { name: "Career Goals & Motivation", slug: "career-goals" },
      { name: "Situational Questions", slug: "situational-questions" },
    ],
  },
  {
    name: "Software Engineering & Git",
    slug: "git",
    topics: [
      { name: "Git Basics", slug: "git-basics" },
      { name: "Branching & Merging", slug: "git-branching" },
      { name: "CI/CD Concepts", slug: "ci-cd" },
      { name: "SDLC & Agile", slug: "sdlc-agile" },
    ],
  },
];

const TARGET_ROLES = [
  { name: "Software Development Engineer", slug: "software-development-engineer", coreSubjects: ["DSA", "OOP", "DBMS", "Operating Systems", "Computer Networks"], requiredSkills: ["Problem solving", "Data structures", "Algorithms", "Software development"] },
  { name: "Frontend Developer", slug: "frontend-developer", coreSubjects: ["Web Development", "JavaScript", "CSS"], requiredSkills: ["HTML", "CSS", "JavaScript", "Accessibility", "Frontend frameworks"] },
  { name: "Backend Developer", slug: "backend-developer", coreSubjects: ["Web Development", "DBMS", "System Design"], requiredSkills: ["API design", "Databases", "Backend frameworks", "Authentication"] },
  { name: "Full Stack Developer", slug: "full-stack-developer", coreSubjects: ["Web Development", "DBMS", "System Design"], requiredSkills: ["HTML", "CSS", "JavaScript", "Frontend frameworks", "Backend frameworks", "Databases"] },
  { name: "Java Developer", slug: "java-developer", coreSubjects: ["Java", "OOP", "DBMS"], requiredSkills: ["Java", "OOP", "Collections", "Concurrency"] },
  { name: "Python Developer", slug: "python-developer", coreSubjects: ["Python", "OOP", "DBMS"], requiredSkills: ["Python", "OOP", "Testing", "API development"] },
  { name: "Data Analyst", slug: "data-analyst", coreSubjects: ["SQL", "Aptitude"], requiredSkills: ["SQL", "Data analysis", "Statistics", "Data visualization"] },
  { name: "Data Scientist", slug: "data-scientist", coreSubjects: ["Python", "SQL", "Statistics"], requiredSkills: ["Python", "Statistics", "Machine learning", "Data analysis"] },
  { name: "Machine Learning Engineer", slug: "machine-learning-engineer", coreSubjects: ["Python", "Statistics", "System Design"], requiredSkills: ["Python", "Machine learning", "Model evaluation", "Data pipelines"] },
  { name: "AI Engineer", slug: "ai-engineer", coreSubjects: ["Python", "Machine Learning", "System Design"], requiredSkills: ["Python", "Machine learning", "AI systems", "Evaluation"] },
  { name: "DevOps Engineer", slug: "devops-engineer", coreSubjects: ["Linux", "Computer Networks", "System Design"], requiredSkills: ["Linux", "Networking", "CI/CD", "Containers", "Monitoring"] },
  { name: "Cloud Engineer", slug: "cloud-engineer", coreSubjects: ["Linux", "Computer Networks", "System Design"], requiredSkills: ["Cloud fundamentals", "Networking", "Security", "Infrastructure automation"] },
  { name: "QA / Automation Engineer", slug: "qa-automation-engineer", coreSubjects: ["Software Engineering", "Programming", "DBMS"], requiredSkills: ["Test design", "Automation", "Programming", "API testing"] },
  { name: "Cybersecurity Engineer", slug: "cybersecurity-engineer", coreSubjects: ["Linux", "Computer Networks", "Operating Systems"], requiredSkills: ["Network security", "Linux", "Threat analysis", "Secure development"] },
];

const DSA_PROBLEMS = [
  { slug: "pair-with-target-sum", title: "Pair With Target Sum", difficulty: "Easy", statement: "Read an integer array and target, then print the indexes of two distinct values whose sum equals the target.", inputFormat: "n, followed by n integers, followed by target.", outputFormat: "Print two zero-based indexes.", constraints: ["2 <= n <= 100000", "Exactly one answer exists."], examples: [{ input: "4\n2 7 11 15\n9\n", output: "0 1\n" }] },
  { slug: "balanced-brackets", title: "Balanced Brackets", difficulty: "Easy", statement: "Print YES when every opening bracket in the input has a correctly ordered closing bracket; otherwise print NO.", inputFormat: "One line containing brackets.", outputFormat: "Print YES or NO.", constraints: ["1 <= length <= 100000"], examples: [{ input: "({[]})\n", output: "YES\n" }] },
  { slug: "two-sum", title: "Two Sum", difficulty: "Easy", statement: "Given an array of integers and a target, return the indices of the two numbers that add up to the target.", inputFormat: "n, followed by n integers, followed by target.", outputFormat: "Print two zero-based indices.", constraints: ["2 <= n <= 10000", "Exactly one answer."], examples: [{ input: "4\n2 7 11 15\n9\n", output: "0 1\n" }] },
  { slug: "reverse-linked-list", title: "Reverse Linked List", difficulty: "Easy", statement: "Reverse a singly linked list given as space-separated integers and print the reversed list.", inputFormat: "n, followed by n integers representing node values.", outputFormat: "Print the reversed list.", constraints: ["0 <= n <= 10000"], examples: [{ input: "5\n1 2 3 4 5\n", output: "5 4 3 2 1\n" }] },
  { slug: "binary-search", title: "Binary Search", difficulty: "Easy", statement: "Given a sorted array and a target, find the index of the target using binary search, or -1 if not found.", inputFormat: "n, followed by n sorted integers, followed by target.", outputFormat: "Print the index or -1.", constraints: ["1 <= n <= 100000"], examples: [{ input: "5\n1 3 5 7 9\n5\n", output: "2\n" }] },
  { slug: "maximum-subarray", title: "Maximum Subarray", difficulty: "Medium", statement: "Find the contiguous subarray with the largest sum using Kadane's algorithm.", inputFormat: "n, followed by n integers.", outputFormat: "Print the maximum subarray sum.", constraints: ["1 <= n <= 100000"], examples: [{ input: "9\n-2 1 -3 4 -1 2 1 -5 4\n", output: "6\n" }] },
  { slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "Easy", statement: "Determine if the input string of brackets is valid.", inputFormat: "A string of brackets.", outputFormat: "Print true or false.", constraints: ["1 <= length <= 10000"], examples: [{ input: "()\n", output: "true\n" }] },
  { slug: "merge-intervals", title: "Merge Intervals", difficulty: "Medium", statement: "Given a list of intervals, merge all overlapping intervals.", inputFormat: "n, followed by n pairs of start end.", outputFormat: "Print merged intervals.", constraints: ["1 <= n <= 10000"], examples: [{ input: "4\n1 3\n2 6\n8 10\n15 18\n", output: "1 6\n8 10\n15 18\n" }] },
  { slug: "longest-common-subsequence", title: "Longest Common Subsequence", difficulty: "Medium", statement: "Find the length of the longest common subsequence of two strings.", inputFormat: "Two strings on separate lines.", outputFormat: "Print the length.", constraints: ["1 <= length <= 1000"], examples: [{ input: "abcde\nace\n", output: "3\n" }] },
  { slug: "climbing-stairs", title: "Climbing Stairs", difficulty: "Easy", statement: "You are climbing n stairs. Each time you can climb 1 or 2 steps. How many distinct ways can you reach the top?", inputFormat: "One integer n.", outputFormat: "Print the number of ways.", constraints: ["1 <= n <= 45"], examples: [{ input: "3\n", output: "3\n" }] },
  { slug: "number-of-islands", title: "Number of Islands", difficulty: "Medium", statement: "Given a 2D grid of '1' (land) and '0' (water), count the number of islands.", inputFormat: "rows cols, followed by rows*cols characters.", outputFormat: "Print the count.", constraints: ["1 <= rows, cols <= 300"], examples: [{ input: "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0\n", output: "1\n" }] },
  { slug: "word-search", title: "Word Search", difficulty: "Medium", statement: "Given a 2D board and a word, find if the word exists in the grid by adjacent cells.", inputFormat: "rows cols, followed by board characters, followed by word.", outputFormat: "Print true or false.", constraints: ["1 <= rows, cols <= 6"], examples: [{ input: "4 3\nA B C\nD E F\nG H I\nJ K L\nABF\n", output: "false\n" }] },
  { slug: "lru-cache", title: "LRU Cache", difficulty: "Hard", statement: "Implement an LRU cache with get and put operations in O(1) time.", inputFormat: "capacity, followed by operation lines.", outputFormat: "Print cache results.", constraints: ["1 <= capacity <= 3000"], examples: [{ input: "2\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2\n", output: "-1\n" }] },
  { slug: "trapping-rain-water", title: "Trapping Rain Water", difficulty: "Hard", statement: "Compute how much water can be trapped between bars of given heights.", inputFormat: "n, followed by n heights.", outputFormat: "Print total water.", constraints: ["1 <= n <= 100000"], examples: [{ input: "12\n0 1 0 2 1 0 1 3 2 1 2 1\n", output: "6\n" }] },
];

async function main() {
  console.log("🌱 Seeding DSA problems...");
  for (const definition of DSA_PROBLEMS) {
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
  console.log(`✅ Seeded ${DSA_PROBLEMS.length} problems.`);

  console.log("🌱 Seeding subjects and topics...");
  for (const subjectDef of SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { slug: subjectDef.slug },
      update: { name: subjectDef.name, status: "PUBLISHED" },
      create: { name: subjectDef.name, slug: subjectDef.slug, status: "PUBLISHED" },
    });
    for (const topicDef of subjectDef.topics) {
      await prisma.topic.upsert({
        where: { subjectId_slug: { subjectId: subject.id, slug: topicDef.slug } },
        update: { name: topicDef.name },
        create: { name: topicDef.name, slug: topicDef.slug, subjectId: subject.id },
      });
    }
  }
  console.log(`✅ Seeded ${SUBJECTS.length} subjects.`);

  console.log("🌱 Seeding target roles...");
  for (const role of TARGET_ROLES) {
    await prisma.targetRole.upsert({
      where: { slug: role.slug },
      update: { ...role, dsaRequirements: {}, status: "PUBLISHED" },
      create: { ...role, dsaRequirements: {}, status: "PUBLISHED" },
    });
  }
  console.log(`✅ Seeded ${TARGET_ROLES.length} target roles.`);

  // Map DSA problems to DSA topics
  const dsaSubject = await prisma.subject.findUnique({ where: { slug: "dsa" } });
  if (dsaSubject) {
    const topicMap = {
      arrays: ["two-sum", "pair-with-target-sum", "maximum-subarray", "trapping-rain-water"],
      "binary-search": ["binary-search"],
      "stack-queue": ["valid-parentheses", "balanced-brackets", "lru-cache"],
      "linked-lists": ["reverse-linked-list"],
      "dynamic-programming": ["climbing-stairs", "longest-common-subsequence"],
      graphs: ["number-of-islands", "word-search"],
      "recursion-backtracking": ["word-search"],
      "sliding-window-two-pointers": ["maximum-subarray"],
      sorting: ["merge-intervals"],
    };
    for (const [topicSlug, problemSlugs] of Object.entries(topicMap)) {
      const topic = await prisma.topic.findFirst({ where: { slug: topicSlug, subjectId: dsaSubject.id } });
      if (!topic) continue;
      for (const problemSlug of problemSlugs) {
        const problem = await prisma.codingProblem.findUnique({ where: { slug: problemSlug } });
        if (!problem) continue;
        await prisma.problemTopic.upsert({
          where: { problemId_topicId: { problemId: problem.id, topicId: topic.id } },
          update: {},
          create: { problemId: problem.id, topicId: topic.id },
        }).catch(() => {});
      }
    }
    console.log("✅ Mapped DSA problems to topics.");
  }

  console.log("🌱 Seeding CareerPrepAI DSA roadmap sheet...");
  const roadmap = await prisma.dSASheet.upsert({
    where: { slug: "careerprepai-dsa-roadmap" },
    update: { name: "CareerPrepAI DSA Roadmap", author: "CareerPrepAI", status: "PUBLISHED" },
    create: {
      name: "CareerPrepAI DSA Roadmap",
      slug: "careerprepai-dsa-roadmap",
      author: "CareerPrepAI",
      description: "A curated sequence of CareerPrepAI practice problems. Sheet progress is saved to your account.",
      status: "PUBLISHED",
    },
  });
  for (const [index, problemDefinition] of DSA_PROBLEMS.entries()) {
    const problem = await prisma.codingProblem.findFirst({
      where: { slug: problemDefinition.slug, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!problem) continue;
    const existing = await prisma.dSASheetProblem.findFirst({
      where: { sheetId: roadmap.id, problemId: problem.id },
      select: { id: true },
    });
    if (!existing) {
      await prisma.dSASheetProblem.create({
        data: {
          sheetId: roadmap.id,
          problemId: problem.id,
          title: problemDefinition.title,
          difficulty: problemDefinition.difficulty,
          sequence: index + 1,
          platform: "CareerPrepAI",
        },
      });
    }
  }
  console.log(`✅ Seeded ${DSA_PROBLEMS.length} curated sheet mappings.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
