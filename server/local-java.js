"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); if (stdout.length > 10000) child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    if (options.input) child.stdin.write(options.input);
    child.stdin.end();
    child.on("error", (error) => finish({ error: error.message, code: null }));
    child.on("close", (code, signal) => finish({ stdout, stderr, code, signal }));
    setTimeout(() => { child.kill(); finish({ stdout, stderr, code: null, signal: "TIMEOUT" }); }, options.timeoutMs);
  });
}

function normalize(value) {
  return String(value || "").trim().replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
}

async function createLocalSubmission(sourceCode, stdin, expectedOutput, timeLimitMs) {
  if (!/\bpublic\s+class\s+Main\b/.test(sourceCode)) return { status: { id: 6, description: "Compilation Error" }, compile_output: "Java submissions must define public class Main." };
  if (/\b(package|Runtime\.getRuntime|ProcessBuilder|System\.setSecurityManager)\b/.test(sourceCode)) return { status: { id: 6, description: "Compilation Error" }, compile_output: "Restricted source construct." };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "intervue-java-"));
  const sourcePath = path.join(directory, "Main.java");
  try {
    fs.writeFileSync(sourcePath, sourceCode, "utf8");
    const environment = { Path: process.env.Path, SystemRoot: process.env.SystemRoot, TEMP: directory, TMP: directory };
    const compiled = await run("javac", ["-encoding", "UTF-8", "Main.java"], { cwd: directory, env: environment, timeoutMs: Math.min(10000, timeLimitMs + 5000) });
    if (compiled.signal === "TIMEOUT" || compiled.code === null) return { status: { id: 5, description: "Time Limit Exceeded" }, stderr: "Compilation timed out." };
    if (compiled.code !== 0) return { status: { id: 6, description: "Compilation Error" }, compile_output: compiled.stderr.slice(0, 2000) };
    const execution = await run("java", ["-Xmx128m", "-Djava.io.tmpdir=" + directory, "-cp", directory, "Main"], { cwd: directory, env: environment, input: stdin, timeoutMs: Math.max(3000, timeLimitMs + 1000) });
    if (execution.signal === "TIMEOUT") return { status: { id: 5, description: "Time Limit Exceeded" }, stderr: "Execution exceeded the time limit." };
    if (execution.code !== 0) return { status: { id: 7, description: "Runtime Error" }, stderr: execution.stderr.slice(0, 2000) };
    if (normalize(execution.stdout) !== normalize(expectedOutput)) return { status: { id: 4, description: "Wrong Answer" }, stdout: execution.stdout.slice(0, 10000) };
    return { status: { id: 3, description: "Accepted" }, stdout: execution.stdout.slice(0, 10000) };
  } finally {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (cleanupError) {
      fs.rm(directory, { recursive: true, force: true }, () => {});
    }
  }
}

module.exports = { createLocalSubmission };
