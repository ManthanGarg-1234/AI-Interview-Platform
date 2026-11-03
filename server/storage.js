"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "data", "submissions.json");
function read() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}
function write(records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(records, null, 2), "utf8");
}
function add(record) { const records = read(); records.push(record); write(records); return record; }
function update(id, userId, patch) { const records = read(); const index = records.findIndex((item) => item.id === id && item.userId === userId); if (index < 0) return null; records[index] = { ...records[index], ...patch }; write(records); return records[index]; }
function find(id, userId) { return read().find((record) => record.id === id && record.userId === userId) || null; }
function list(userId) { return read().filter((record) => record.userId === userId); }
module.exports = { add, update, find, list };
