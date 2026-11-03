"use strict";

const { Worker } = require("bullmq");
const { getPrisma } = require("./prisma");
const storage = require("./private-storage");
const { processResumeAnalysis } = require("./resume-analysis");

function connection() {
  const url = new URL(process.env.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined };
}
function printableText(buffer) {
  return buffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50_000);
}
function startResumeWorker() {
  if (!process.env.REDIS_URL) return null;
  const worker = new Worker("resume-processing", async (job) => {
    const prisma = getPrisma();
    const processing = await prisma.resumeProcessingJob.findFirst({ where: { resumeVersionId: job.data.resumeVersionId } });
    if (!processing) throw new Error("Resume processing job not found.");
    await prisma.resumeProcessingJob.update({ where: { id: processing.id }, data: { status: "PROCESSING", attempts: { increment: 1 }, startedAt: new Date() } });
    try {
      const version = await prisma.resumeVersion.findUnique({ where: { id: job.data.resumeVersionId }, include: { file: true } });
      if (!version) throw new Error("Resume version not found.");
      const text = printableText(await storage.get(version.file.objectKey));
      await prisma.resumeVersion.update({ where: { id: version.id }, data: { parsedText: text, parserVersion: "local-printable-v1" } });
      await prisma.storedFile.update({ where: { id: version.fileId }, data: { scanStatus: "CLEAN" } });
      await prisma.resumeProcessingJob.update({ where: { id: processing.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    } catch (error) {
      await prisma.resumeProcessingJob.update({ where: { id: processing.id }, data: { status: "FAILED", errorMessage: error.message.slice(0, 500), completedAt: new Date() } });
      throw error;
    }
  }, { connection: connection() });
  return worker;
}
function startAnalysisWorker() {
  if (!process.env.REDIS_URL) return null;
  return new Worker("resume-analysis", async (job) => processResumeAnalysis(job.data.analysisId), { connection: connection() });
}

if (require.main === module) {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required to start resume workers.");
  startResumeWorker();
  startAnalysisWorker();
  console.log("Resume processing workers started.");
}

module.exports = { startResumeWorker, startAnalysisWorker };
