import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const editorLanguage = {
  C: "c",
  "C++": "cpp",
  Java: "java",
  Python: "python",
  JavaScript: "javascript",
};
const runTerminalStatuses = new Set(["COMPLETED", "FAILED"]);
const submissionTerminalStatuses = new Set([
  "ACCEPTED",
  "WRONG_ANSWER",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
  "CANCELLED",
]);
const maxRunPolls = 120;
const maxSubmissionPolls = 120;

export default function CodingProblemPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState("Java");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [runId, setRunId] = useState(null);
  const [submissionId, setSubmissionId] = useState(null);
  const idempotencyKey = useRef(null);
  const problem = useQuery({
    queryKey: ["coding-problem", slug],
    queryFn: async () => (await api.get(`/coding/problems/${slug}`)).data.data,
  });
  const executionHealth = useQuery({
    queryKey: ["coding-execution-health"],
    queryFn: async () => (await api.get("/coding/execution-health")).data.data,
    enabled: Boolean(problem.data?.id),
    refetchInterval: (query) => (query.state.data?.ready ? 30_000 : 5_000),
    retry: false,
  });
  const starter = useQuery({
    queryKey: ["coding-starter", slug, language],
    queryFn: async () =>
      (
        await api.get(`/coding/problems/${slug}/starter-code`, {
          params: { language },
        })
      ).data.data,
    enabled: Boolean(problem.data?.languages?.includes(language)),
  });

  useEffect(() => {
    const firstLanguage = problem.data?.languages?.[0];
    if (firstLanguage && !problem.data.languages.includes(language))
      setLanguage(firstLanguage);
  }, [problem.data, language]);
  useEffect(() => {
    if (starter.data?.starterCode !== undefined)
      setCode(starter.data.starterCode);
  }, [starter.data]);
  useEffect(() => {
    setSubmissionId(null);
    idempotencyKey.current = null;
  }, [slug]);

  const runResult = useQuery({
    queryKey: ["coding-run", runId],
    queryFn: async () => (await api.get(`/coding/runs/${runId}`)).data.data,
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      query.state.error ||
      runTerminalStatuses.has(query.state.data?.status) ||
      query.state.dataUpdateCount >= maxRunPolls
        ? false
        : 1000,
  });
  const submissionHistory = useQuery({
    queryKey: ["coding-submission-history", problem.data?.id],
    queryFn: async () =>
      (
        await api.get("/coding/submissions", {
          params: { problemId: problem.data.id, pageSize: 1 },
        })
      ).data.data,
    enabled: Boolean(problem.data?.id),
  });
  const displayedSubmissionId =
    submissionId || submissionHistory.data?.items?.[0]?.id || null;
  const submissionResult = useQuery({
    queryKey: ["coding-submission", displayedSubmissionId],
    queryFn: async () =>
      (await api.get(`/coding/submissions/${displayedSubmissionId}`)).data.data,
    enabled: Boolean(displayedSubmissionId),
    refetchInterval: (query) =>
      query.state.error ||
      submissionTerminalStatuses.has(query.state.data?.status) ||
      query.state.dataUpdateCount >= maxSubmissionPolls
        ? false
        : 1500,
  });
  const run = useMutation({
    mutationFn: () =>
      api.post("/coding/runs", {
        problemId: problem.data.id,
        language,
        sourceCode: code,
        ...(useCustomInput ? { customInput } : {}),
      }),
    onSuccess: ({ data }) => {
      setRunId(data.data.id);
      setMessage(data.data.message);
    },
    onError: (error) => setMessage(getApiError(error)),
  });
  const submit = useMutation({
    mutationFn: () => {
      idempotencyKey.current ||= crypto.randomUUID();
      return api.post("/coding/submissions", {
        problemId: problem.data.id,
        language,
        sourceCode: code,
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: ({ data }) => {
      setSubmissionId(data.data.id);
      idempotencyKey.current = null;
      setMessage("Submission queued.");
      queryClient.invalidateQueries({
        queryKey: ["coding-submission-history", problem.data.id],
      });
    },
    onError: (error) => setMessage(getApiError(error)),
  });

  if (problem.isLoading)
    return <p className="text-slate-500">Loading problem…</p>;
  if (problem.isError)
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-700">
        <p>{getApiError(problem.error)}</p>
        <button
          type="button"
          onClick={() => problem.refetch()}
          className="mt-3 rounded-lg border border-red-200 px-3 py-2 font-bold"
        >
          Try again
        </button>
      </div>
    );
  const availableLanguages = problem.data.languages || [];
  const executionError = run.error || submit.error;
  const runIsProcessing =
    run.isPending ||
    Boolean(
      runId &&
      !runResult.isError &&
      (!runResult.data || !runTerminalStatuses.has(runResult.data.status)),
    );
  const submissionIsProcessing =
    submit.isPending ||
    Boolean(
      displayedSubmissionId &&
      !submissionResult.isError &&
      (!submissionResult.data ||
        !submissionTerminalStatuses.has(submissionResult.data.status)),
    );
  const pollingStopped =
    runResult.data &&
    !runTerminalStatuses.has(runResult.data.status) &&
    runResult.dataUpdateCount >= maxRunPolls;
  const submissionPollingStopped =
    submissionResult.data &&
    !submissionTerminalStatuses.has(submissionResult.data.status) &&
    submissionResult.dataUpdateCount >= maxSubmissionPolls;

  if (availableLanguages.length === 0)
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-amber-800">
        No enabled languages are available for this problem.
      </div>
    );
  return (
    <div className="max-w-7xl">
      <Link to="/student/coding" className="text-sm font-bold text-indigo-600">
        ← All problems
      </Link>
      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-950">
              {problem.data.title}
            </h1>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
              {problem.data.difficulty}
            </span>
          </div>
          <p className="mt-5 whitespace-pre-wrap leading-7 text-slate-700">
            {problem.data.statement}
          </p>
          <Section title="Input format" value={problem.data.inputFormat} />
          <Section title="Output format" value={problem.data.outputFormat} />
          <Section
            title="Constraints"
            value={problem.data.constraints?.join("\n")}
          />
          <Section
            title="Examples"
            value={problem.data.examples
              ?.map(
                (example) =>
                  `Input:\n${example.input}\nOutput:\n${example.output}`,
              )
              .join("\n\n")}
          />
        </article>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-3">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white"
              aria-label="Language"
            >
              {availableLanguages.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCode(starter.data?.starterCode || "")}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200"
            >
              Reset code
            </button>
          </div>
          {starter.isError ? (
            <div className="p-5 text-sm text-red-300">
              <p>{getApiError(starter.error)}</p>
              <button
                type="button"
                onClick={() => starter.refetch()}
                className="mt-3 rounded-lg border border-red-400 px-3 py-2 font-bold"
              >
                Retry starter code
              </button>
            </div>
          ) : (
            <Editor
              height="520px"
              theme="vs-dark"
              language={editorLanguage[language] || "plaintext"}
              value={code}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
              }}
              loading={<p className="p-5 text-slate-300">Loading editor…</p>}
            />
          )}
          <div className="border-t border-slate-800 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={useCustomInput}
                onChange={(event) => setUseCustomInput(event.target.checked)}
              />
              Run with custom input instead of public examples
            </label>
            {useCustomInput && (
              <textarea
                aria-label="Custom input"
                value={customInput}
                onChange={(event) => setCustomInput(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-slate-100"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-3">
            <span className="text-sm text-slate-400">
              {submissionIsProcessing
                ? submissionStateLabel(
                    submit.isPending ? "QUEUED" : submissionResult.data?.status,
                  )
                : runIsProcessing
                  ? runResult.data?.status === "RUNNING"
                    ? "Processing…"
                    : "Queued…"
                  : message}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!code || runIsProcessing}
                onClick={() => {
                  setRunId(null);
                  setMessage("Queueing code run…");
                  run.mutate();
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {runIsProcessing ? "Running…" : "Run"}
              </button>
              <button
                type="button"
                disabled={!code || submissionIsProcessing}
                onClick={() => submit.mutate()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {submissionIsProcessing ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
          <ExecutionAvailability
            health={executionHealth.data}
            error={executionHealth.error}
            executionError={executionError}
          />
          {runResult.isError && (
            <p className="border-t border-slate-800 p-3 text-sm text-red-300">
              {getApiError(runResult.error)}
            </p>
          )}
          {pollingStopped && (
            <div className="border-t border-slate-800 p-3 text-sm text-amber-300">
              This run is taking longer than expected.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => runResult.refetch()}
              >
                Check again
              </button>
            </div>
          )}
          {runResult.data && (
            <ExecutionResult title="Run result" result={runResult.data} />
          )}
          {submissionHistory.isError && (
            <p className="border-t border-slate-800 p-3 text-sm text-red-300">
              Could not load previous submissions:{" "}
              {getApiError(submissionHistory.error)}
            </p>
          )}
          {submissionResult.isError && (
            <p className="border-t border-slate-800 p-3 text-sm text-red-300">
              {getApiError(submissionResult.error)}
            </p>
          )}
          {submissionResult.data && (
            <ExecutionResult
              title="Submission result"
              result={submissionResult.data}
            />
          )}
          {submissionPollingStopped && (
            <div className="border-t border-slate-800 p-3 text-sm text-amber-300">
              This submission is taking longer than expected.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => submissionResult.refetch()}
              >
                Check again
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ExecutionAvailability({ health, error, executionError }) {
  const unauthenticated =
    error?.response?.status === 401 || executionError?.response?.status === 401;
  const items = health
    ? [
        {
          label: "Redis",
          status: health.redis,
          detail:
            health.redis === "ready"
              ? "Connected"
              : "Check REDIS_URL and the Redis service.",
        },
        {
          label: "JDoodle",
          status: health.jdoodle.status,
          detail: jdoodleStatusDetail(health.jdoodle),
        },
        {
          label: "Worker",
          status: health.worker,
          detail:
            health.worker === "ready"
              ? "BullMQ worker registered"
              : health.worker === "unknown"
                ? "Worker could not be detected."
                : "Start npm run coding-worker after configuring JDoodle.",
        },
      ]
    : [];
  if (!health && !error && !executionError) return null;
  const ready = health?.ready && !error;
  return (
    <section
      role="status"
      aria-label="Code execution services"
      className={`border-t p-4 text-sm ${ready ? "border-emerald-900 bg-emerald-950 text-emerald-100" : "border-amber-900 bg-amber-950 text-amber-100"}`}
    >
      <p className="font-bold">
        {unauthenticated
          ? "Authentication required"
          : ready
            ? "Execution service ready"
            : "Code execution infrastructure needs attention"}
      </p>
      {unauthenticated ? (
        <p className="mt-1">
          Your sign-in session is missing or expired. Sign in again to check
          execution services.
        </p>
      ) : health ? (
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.label}>
              <span className="font-bold">
                {item.label}: {serviceStatusLabel(item.label, item.status)}
              </span>
              <p className="mt-1 text-xs opacity-80">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">
          {error
            ? "Could not check the execution services. Retry the page after confirming the API is reachable."
            : "Checking Redis, JDoodle, and the coding worker…"}
        </p>
      )}
      {executionError && !unauthenticated && (
        <p className="mt-2">{executionFailureDetail(executionError)}</p>
      )}
    </section>
  );
}

function serviceStatusLabel(service, status) {
  if (service === "Redis")
    return status === "ready"
      ? "Ready"
      : status === "not_configured"
        ? "Not configured"
        : status === "invalid_configuration"
          ? "Invalid configuration"
          : "Unavailable";
  if (service === "Worker")
    return status === "ready"
      ? "Ready"
      : status === "unknown"
        ? "Unknown"
        : "Unavailable";
  return (
    {
      ready: "Ready",
      not_configured: "Not configured",
      invalid_configuration: "Invalid configuration",
      authentication_failed: "Authentication failed",
      unavailable: "Unavailable",
      invalid_response: "Invalid response",
      credits_exhausted: "Daily credits exhausted",
    }[status] || "Unknown"
  );
}

function jdoodleStatusDetail(jdoodle) {
  if (jdoodle.status === "credits_exhausted")
    return `Daily usage: ${jdoodle.usage?.used ?? "?"} of ${jdoodle.usage?.dailyLimit ?? "?"} executions.`;
  if (jdoodle.status === "authentication_failed")
    return "JDoodle rejected its configured credentials.";
  if (jdoodle.status === "unavailable")
    return "JDoodle could not be reached. Check the provider connection.";
  if (jdoodle.status === "not_configured")
    return "Configure the server-side JDoodle credentials.";
  if (jdoodle.status === "invalid_configuration")
    return "Check the server-side JDoodle version and timeout settings.";
  return jdoodle.usage
    ? `Daily usage: ${jdoodle.usage.used} of ${jdoodle.usage.dailyLimit} executions.`
    : "JDoodle credentials and usage endpoint verified.";
}

function executionFailureDetail(error) {
  if (error?.response?.data?.error?.code === "CODING_QUEUE_UNAVAILABLE")
    return "Redis is unavailable. Check the local Redis service and REDIS_URL.";
  if (error?.response?.data?.error?.code === "CODING_WORKER_UNAVAILABLE")
    return "The Redis queue is connected, but no coding worker is registered. Start npm run coding-worker.";
  if (error?.response?.data?.error?.code === "JDOODLE_UNAVAILABLE")
    return "JDoodle is not configured. Add credentials to the server environment.";
  if (error?.response?.data?.error?.code === "JDOODLE_AUTHENTICATION_FAILED")
    return "JDoodle rejected the configured credentials.";
  if (error?.response?.data?.error?.code === "JDOODLE_CREDITS_EXHAUSTED")
    return "JDoodle's daily execution credits are exhausted. Usage resets at 23:55 UTC.";
  if (error?.response?.data?.error?.code === "CODING_LANGUAGE_UNSUPPORTED")
    return "Only Java execution is enabled.";
  if (error?.response?.status === 401)
    return "Authentication failed. Sign in again before running or submitting code.";
  return (
    error?.response?.data?.error?.message || "Code execution request failed."
  );
}

function Section({ title, value }) {
  if (!value) return null;
  return (
    <section className="mt-6">
      <h2 className="font-bold text-slate-950">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {value}
      </p>
    </section>
  );
}

function ExecutionResult({ title, result }) {
  const execution = result.executionResults?.[0] || result;
  const storedSummary = execution.perTestSummary;
  const perTestResults =
    execution.perTestResults ||
    (Array.isArray(storedSummary) ? { tests: storedSummary } : null);
  const tests = perTestResults?.tests || [];
  const verdict = result.verdict || execution.failureCode || "PENDING";
  const statusLabel =
    title === "Submission result"
      ? submissionStateLabel(result.status)
      : result.status;
  return (
    <div className="border-t border-slate-800 p-3 text-sm text-slate-300">
      <p className="font-bold text-white">
        {title}: {statusLabel} / {verdictLabel(verdict)}
      </p>
      {execution.perTestResults && (
        <p className="mt-1">
          Public tests: {execution.perTestResults.passedTests} passed,{" "}
          {execution.perTestResults.failedTests} failed of{" "}
          {execution.perTestResults.totalTests} total (
          {execution.perTestResults.executedTests} executed)
        </p>
      )}
      {execution.passedTests !== undefined && !execution.perTestResults && (
        <p className="mt-1">
          Tests: {execution.passedTests} passed,{" "}
          {execution.failedTests ??
            Math.max(0, execution.totalTests - execution.passedTests)}{" "}
          failed of {execution.totalTests} total (
          {execution.evaluatedTests ?? tests.length} evaluated)
        </p>
      )}
      {execution.score !== null && execution.score !== undefined && (
        <p>Score: {execution.score}%</p>
      )}
      {execution.executionTimeMs !== null &&
        execution.executionTimeMs !== undefined && (
          <p>Execution time: {execution.executionTimeMs} ms</p>
        )}
      {execution.memoryKb !== null && execution.memoryKb !== undefined && (
        <p>Memory: {execution.memoryKb} KB</p>
      )}
      {execution.compileOutput && (
        <pre className="mt-2 whitespace-pre-wrap text-red-300">
          {execution.compileOutput}
        </pre>
      )}
      {execution.failureCode === "JDOODLE_CREDITS_EXHAUSTED" && (
        <p className="mt-2 text-amber-300">
          JDoodle daily execution credits are exhausted. Usage resets at 23:55
          UTC.
        </p>
      )}
      {execution.stderr && (
        <pre className="mt-2 whitespace-pre-wrap text-red-300">
          {execution.stderr}
        </pre>
      )}
      {tests.map((item, index) => (
        <section
          key={`${item.sequence}-${index}`}
          className="mt-3 rounded-lg border border-slate-700 p-3"
        >
          <p className="font-bold text-white">
            {item.kind === "HIDDEN"
              ? `Hidden test ${item.sequence}`
              : item.kind === "CUSTOM"
                ? "Custom input"
                : `Public test ${item.sequence}`}
            : {verdictLabel(item.verdict)}
            {item.passed === true
              ? " — Passed"
              : item.passed === false
                ? " — Failed"
                : ""}
          </p>
          {item.executionTimeMs !== null &&
            item.executionTimeMs !== undefined && (
              <p>Execution time: {item.executionTimeMs} ms</p>
            )}
          {item.memoryKb !== null && item.memoryKb !== undefined && (
            <p>Memory: {item.memoryKb} KB</p>
          )}
          {item.kind === "PUBLIC" && item.stdout !== undefined && (
            <OutputBlock label="Actual output" value={item.stdout} />
          )}
          {item.kind === "PUBLIC" && item.stderr && (
            <OutputBlock label="Error output" value={item.stderr} />
          )}
          {item.kind === "PUBLIC" && item.compileOutput && (
            <OutputBlock
              label="Compilation output"
              value={item.compileOutput}
            />
          )}
          {item.expectedOutput !== null &&
            item.expectedOutput !== undefined && (
              <OutputBlock
                label="Expected output"
                value={item.expectedOutput}
              />
            )}
          <OutputBlock label="Actual output" value={item.stdout} />
          {item.compileOutput && (
            <OutputBlock
              label="Compilation output"
              value={item.compileOutput}
            />
          )}
          {item.stderr && (
            <OutputBlock label="Error output" value={item.stderr} />
          )}
        </section>
      ))}
      {!tests.length &&
        execution.stdout !== null &&
        execution.stdout !== undefined && (
          <OutputBlock label="Actual output" value={execution.stdout} />
        )}
    </div>
  );
}

function OutputBlock({ label, value }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <pre className="mt-1 whitespace-pre-wrap text-slate-200">
        {value || "(empty)"}
      </pre>
    </div>
  );
}

function verdictLabel(verdict) {
  return (
    {
      ACCEPTED: "Passed",
      WRONG_ANSWER: "Failed",
      COMPILATION_ERROR: "Compilation Error",
      RUNTIME_ERROR: "Runtime Error",
      TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
      MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
      OUTPUT_LIMIT_EXCEEDED: "Output Limit Exceeded",
      SYSTEM_ERROR: "System Error",
      INTERNAL_ERROR: "Execution Error",
      PENDING: "Queued",
    }[verdict] || verdict
  );
}

function submissionStateLabel(status) {
  return (
    {
      QUEUED: "Queued…",
      PROCESSING: "Processing…",
      EVALUATING: "Evaluating test cases…",
      COMPLETED: "Completed",
      FAILED: "Failed",
      ACCEPTED: "Accepted",
      WRONG_ANSWER: "Wrong Answer",
      COMPILATION_ERROR: "Compilation Error",
      RUNTIME_ERROR: "Runtime Error",
      TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
      MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
      OUTPUT_LIMIT_EXCEEDED: "Output Limit Exceeded",
      SYSTEM_ERROR: "System Error",
      CANCELLED: "Cancelled",
    }[status] ||
    status ||
    "Queued…"
  );
}
