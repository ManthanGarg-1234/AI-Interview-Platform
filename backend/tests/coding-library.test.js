"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, parseImport } = require("../coding-library-admin");
const { normalizeProblemUrl } = require("../coding-library");

test("CSV parsing supports quoted commas and escaped quotes", () => {
  const rows = parseCsv('sheetSlug,title,difficulty,platform,url,topic,summary\nset-1,"Two, Sum",EASY,LEETCODE,https://leetcode.com/problems/two-sum/,Arrays,"Uses ""hashing""."');
  assert.equal(rows[0].title, "Two, Sum");
  assert.equal(rows[0].summary, 'Uses "hashing".');
});

test("CSV import canonicalizes valid platform URLs and flags duplicate associations", () => {
  const csv = [
    "sheetSlug,title,difficulty,platform,url,topic",
    "set-1,Two Sum,EASY,LEETCODE,https://leetcode.com/problems/two-sum/?source=practice,Arrays",
    "set-1,Two Sum,EASY,LEETCODE,https://leetcode.com/problems/two-sum/,Arrays",
  ].join("\n");
  const result = parseImport(csv);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].canonicalUrl, "https://leetcode.com/problems/two-sum");
  assert.deepEqual(result.errors.map((item) => item.row), [3]);
});

test("invalid and non-public external problem URLs are rejected", () => {
  const result = parseImport([
    "sheetSlug,title,difficulty,platform,url,topic",
    "set-1,Unsafe,EASY,LEETCODE,http://leetcode.com/problems/unsafe,Arrays",
  ].join("\n"));
  assert.equal(result.records.length, 0);
  assert.equal(result.errors[0].row, 2);
  assert.throws(() => normalizeProblemUrl("https://127.0.0.1/problem", "OTHER"), /public HTTPS host/);
});

test("malformed CSV quoting is rejected", () => {
  assert.throws(() => parseCsv('sheetSlug,title,difficulty,platform,url,topic\nset-1,"Unclosed,EASY,LEETCODE,https://leetcode.com/x,Arrays'), /unclosed quoted field/);
});
