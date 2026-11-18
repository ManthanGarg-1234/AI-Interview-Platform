"use strict";

const { Worker } = require("bullmq");
const { getPrisma } = require("./prisma");
const storage = require("./private-storage");
const { processResumeAnalysis } = require("./resume-analysis");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

function connection() {
  const url = new URL(process.env.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined };
}
function normalizeResumeText(value) {
  return String(value || "")
    .replace(/\u00ad/g, "")
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/[•●■▪◦]/g, "-")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n /g, "\n")
    .trim()
    .slice(0, 50_000);
}
async function extractResumeText(buffer, mimeType) {
  if (mimeType === "application/pdf") {
    const parsed = await pdfParse(buffer);
    const text = normalizeResumeText(parsed.text);
    const pageCount = Number(parsed.numpages || 1);
    const charsPerPage = text.length / Math.max(pageCount, 1);
    const isEmpty = text.length < 40;
    const isScanned = !isEmpty && charsPerPage < 120;
    return {
      text,
      parserVersion: "pdf-parse-mammoth-v1",
      parseQuality: isEmpty ? "empty" : isScanned ? "scanned" : "text",
      warning: isEmpty
        ? "This PDF appears to contain no extractable text. Please upload a text-based PDF or DOCX."
        : isScanned
          ? "Very little text was extracted. This may be a scanned PDF; add a text-based copy for a more reliable analysis."
          : null,
    };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const parsed = await mammoth.extractRawText({ buffer });
    const text = normalizeResumeText(parsed.value);
    return {
      text,
      parserVersion: "pdf-parse-mammoth-v1",
      parseQuality: text.length < 40 ? "empty" : "text",
      warning: text.length < 40 ? "No readable resume text was found in this DOCX." : null,
    };
  }
  throw Object.assign(new Error("Unsupported resume file type."), { status: 400, code: "INVALID_FILE" });
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
      const extracted = await extractResumeText(await storage.get(version.file.objectKey), version.file.mimeType);
      await prisma.resumeVersion.update({ where: { id: version.id }, data: { parsedText: extracted.text, parserVersion: extracted.parserVersion, parseQuality: extracted.parseQuality, parserWarning: extracted.warning } });
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

module.exports = { normalizeResumeText, extractResumeText, startResumeWorker, startAnalysisWorker };
