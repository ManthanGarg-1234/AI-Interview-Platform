"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../index");

let server;
let origin;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => server.close());

test("health and public problem catalogue do not expose hidden tests", async () => {
  const health = await fetch(`${origin}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.judgeConfigured, false);
  const response = await fetch(`${origin}/api/problems`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length >= 2, true);
  assert.equal(Object.hasOwn(body.data[0], "hiddenTests"), false);
});

test("protected submission endpoint rejects missing authentication", async () => {
  const response = await fetch(`${origin}/api/submissions/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ problemId: "sum-pair", sourceCode: "class Main {}" })
  });
  assert.equal(response.status, 401);
});

test("local Java runner compiles and executes a submission", async () => {
  const response = await fetch(`${origin}/api/submissions/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-user-id": "demo-candidate" },
    body: JSON.stringify({
      problemId: "sum-pair",
      sourceCode: "import java.util.*;\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); int n=s.nextInt(); int[] v=new int[n]; for(int i=0;i<n;i++)v[i]=s.nextInt(); int t=s.nextInt(); for(int i=0;i<n;i++) for(int j=i+1;j<n;j++) if(v[i]+v[j]==t) { System.out.println(i+\" \"+j); return; } } }",
      idempotencyKey: `test-local-runner-${Date.now()}`
    })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.data.verdict, "Accepted");
  assert.equal(body.data.passedTests, 2);
  assert.equal(body.data.status, "Completed");
});

test("local Java runner reports compilation and wrong-answer verdicts", async () => {
  const submit = (sourceCode, key) => fetch(`${origin}/api/submissions/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-user-id": "demo-candidate" },
    body: JSON.stringify({ problemId: "sum-pair", sourceCode, idempotencyKey: key })
  }).then((response) => response.json());
  const compileError = await submit("public class Main {", `test-compile-${Date.now()}`);
  assert.equal(compileError.data.verdict, "Compilation Error");
  const wrongAnswer = await submit("public class Main { public static void main(String[] a) { System.out.println(\"wrong\"); } }", `test-wrong-${Date.now()}`);
  assert.equal(wrongAnswer.data.verdict, "Wrong Answer");
});
