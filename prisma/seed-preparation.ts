import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const subjects = [
  ["DSA", "dsa"], ["DBMS", "dbms"], ["Operating Systems", "operating-systems"],
  ["Computer Networks", "computer-networks"], ["OOP", "oop"], ["Java", "java"],
  ["C/C++", "c-cpp"], ["Python", "python"], ["Web Development", "web-development"],
  ["System Design", "system-design"], ["Aptitude", "aptitude"],
  ["Logical Reasoning", "logical-reasoning"], ["Communication Skills", "communication-skills"],
] as const;

async function main() {
  for (const [name, slug] of subjects) {
    await prisma.subject.upsert({ where: { slug }, update: { name, status: "PUBLISHED" }, create: { name, slug, status: "PUBLISHED" } });
  }
  console.log(`Upserted ${subjects.length} student preparation categories.`);
}

main().catch((error: unknown) => {
  console.error("Preparation category seed failed:", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
