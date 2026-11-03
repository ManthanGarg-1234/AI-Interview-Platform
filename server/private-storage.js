"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = () => path.resolve(process.env.STORAGE_ROOT || "server/data/uploads");
function normalize(key) {
  const value = path.posix.normalize(key);
  if (value.startsWith("..") || value.includes("/../") || path.isAbsolute(value)) {
    const error = new Error("Invalid storage key.");
    error.status = 400;
    throw error;
  }
  return value;
}
async function put(key, buffer) {
  const safeKey = normalize(key);
  await fs.mkdir(path.dirname(path.join(root(), safeKey)), { recursive: true });
  await fs.writeFile(path.join(root(), safeKey), buffer, { flag: "wx" });
  return { key: safeKey, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}
async function get(key) {
  return fs.readFile(path.join(root(), normalize(key)));
}
async function remove(key) {
  await fs.rm(path.join(root(), normalize(key)), { force: true });
}

module.exports = { put, get, remove };
