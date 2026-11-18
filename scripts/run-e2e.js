"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const projectId = "demo-careerprepai";
const backendPort = 3001;
const frontendPort = 5174;
const emulatorHost = "127.0.0.1:9099";
const root = process.cwd();
const processes = [];

function start(executable, args, env, cwd = root) {
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: false,
  });
  processes.push(child);
  return child;
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `${label} did not become ready: ${lastError?.message || "unknown error"}`,
  );
}

async function stopExistingEmulator() {
  try {
    await fetch(
      `http://${emulatorHost}/emulator/v1/projects/${projectId}:shutdown`,
      { method: "POST" },
    );
  } catch {
    // Nothing is listening when the emulator is already stopped.
  }
}

async function main() {
  const runId = `e2e-${Date.now()}-${process.pid}`;
  await stopExistingEmulator();
  start(
    process.execPath,
    [
      "node_modules/firebase-tools/lib/bin/firebase.js",
      "emulators:start",
      "--only",
      "auth",
      "--project",
      projectId,
    ],
    {
      FIREBASE_AUTH_EMULATOR: "true",
      FIREBASE_AUTH_EMULATOR_HOST: emulatorHost,
    },
  );
  await waitFor(`http://${emulatorHost}/`, "Firebase Auth Emulator");

  const secrets = {
    ACCESS_TOKEN_SECRET: `e2e-access-${runId}`,
    SESSION_TOKEN_PEPPER: `e2e-pepper-${runId}`,
  };
  start(process.execPath, ["backend/index.js"], {
    ...secrets,
    NODE_ENV: "test",
    PORT: String(backendPort),
    FRONTEND_ORIGIN: `http://127.0.0.1:${frontendPort}`,
    BACKEND_ORIGIN: `http://127.0.0.1:${backendPort}`,
    FIREBASE_PROJECT_ID: projectId,
    FIREBASE_AUTH_EMULATOR: "true",
    FIREBASE_AUTH_EMULATOR_HOST: emulatorHost,
    REDIS_URL: "",
    E2E_RUN_ID: runId,
  });
  await waitFor(`http://127.0.0.1:${backendPort}/api/v1/health`, "Backend API");

  start(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(frontendPort),
    ],
    {
      VITE_API_URL: `http://127.0.0.1:${backendPort}/api/v1`,
      VITE_FIREBASE_API_KEY: "demo-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
      VITE_FIREBASE_PROJECT_ID: projectId,
      VITE_FIREBASE_APP_ID: "demo-app-id",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "demo-sender-id",
      VITE_FIREBASE_AUTH_EMULATOR: "true",
      VITE_FIREBASE_AUTH_EMULATOR_HOST: `http://${emulatorHost}`,
      E2E_RUN_ID: runId,
    },
    path.join(root, "frontend"),
  );
  await waitFor(`http://127.0.0.1:${frontendPort}/`, "Frontend");

  const tests = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=e2e/playwright.config.js",
    ],
    {
      cwd: root,
      env: { ...process.env, E2E_RUN_ID: runId },
      stdio: "inherit",
      windowsHide: false,
    },
  );
  const exitCode = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
}

async function shutdown() {
  await stopExistingEmulator();
  for (const child of processes.reverse()) {
    if (!child.killed) child.kill();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(shutdown);
