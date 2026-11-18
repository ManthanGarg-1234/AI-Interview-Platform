import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const categoryLabels = {
  parseability: "Parseability",
  standardSections: "Standard sections",
  contactCompleteness: "Contact completeness",
  formattingHygiene: "Formatting hygiene",
  contentStrength: "Content strength",
  skillsKeywordQuality: "Skills and keywords",
};

export default function ResumeAnalysisPage() {
  const client = useQueryClient();
  const fileInput = useRef(null);
  const [resumeVersionId, setResumeVersionId] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  const resumes = useQuery({ queryKey: ["student-resumes"], queryFn: async () => (await api.get("/me/resumes")).data.data });
  const history = useQuery({
    queryKey: ["resume-analyses"],
    queryFn: async () => (await api.get("/me/resume-analyses")).data.data,
    refetchInterval: selected?.status === "PENDING" || selected?.status === "PROCESSING" ? 3000 : false,
  });
  const detail = useQuery({
    queryKey: ["resume-analysis", selected?.id],
    queryFn: async () => (await api.get(`/me/resume-analyses/${selected.id}`)).data.data,
    enabled: Boolean(selected?.id),
    refetchInterval: selected?.status === "PENDING" || selected?.status === "PROCESSING" ? 3000 : false,
  });
  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      return api.post("/me/resumes", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: ({ data }) => {
      const active = data.data.activeVersion;
      if (active) setResumeVersionId(active.id);
      setMessage("Resume uploaded. Processing will finish shortly.");
      client.invalidateQueries({ queryKey: ["student-resumes"] });
    },
    onError: async (error) => setMessage(await getApiError(error)),
  });
  const analyze = useMutation({
    mutationFn: () => {
      const payload = { resumeVersionId };
      if (targetRole.trim()) payload.targetRole = targetRole.trim();
      if (jobDescription.trim()) payload.jobDescription = jobDescription.trim();
      return api.post("/me/resume-analyses", payload);
    },
    onSuccess: ({ data }) => {
      setSelected(data.data);
      setMessage("Analysis queued.");
      client.invalidateQueries({ queryKey: ["resume-analyses"] });
    },
    onError: async (error) => setMessage(await getApiError(error)),
  });
  const retry = useMutation({
    mutationFn: () => api.post(`/me/resume-analyses/${selected.id}/retry`),
    onSuccess: ({ data }) => {
      setSelected(data.data);
      client.invalidateQueries({ queryKey: ["resume-analyses"] });
    },
  });

  const resumeVersions = resumes.data?.flatMap((resume) => resume.versions?.map((version) => ({ ...version, resumeTitle: resume.title })) || []) || [];
  const canAnalyze = Boolean(resumeVersionId) && Boolean(targetRole.trim() || jobDescription.trim());

  return (
    <div className="max-w-6xl text-slate-900 dark:text-slate-100">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Resume intelligence</p>
        <h1 className="mt-2 text-3xl font-bold">Analyze your resume</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Scores are deterministic estimates, not proprietary ATS results.</p>
      </header>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(event) => event.key === "Enter" && fileInput.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-indigo-300 p-6 text-center dark:border-indigo-700"
        >
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => event.target.files?.[0] && upload.mutate(event.target.files[0])}
          />
          <p className="font-bold text-indigo-700 dark:text-indigo-300">{upload.isPending ? "Uploading resume…" : "Drop or choose a PDF/DOCX resume"}</p>
          <p className="mt-1 text-xs text-slate-500">Maximum 5 MB</p>
        </div>
        {upload.isError && <p role="alert" className="mt-3 text-sm text-red-700">Upload failed: {getApiError(upload.error)}</p>}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Resume version
            <select value={resumeVersionId} onChange={(event) => setResumeVersionId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
              <option value="">Select a resume</option>
              {resumeVersions.map((version) => <option key={version.id} value={version.id}>{version.resumeTitle} · version {version.version} · {version.file.scanStatus}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Target role
            <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="e.g. Backend Engineer" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            Job description (optional)
            <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} rows="5" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 dark:border-slate-700 dark:bg-slate-950" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button disabled={!canAnalyze || analyze.isPending} onClick={() => analyze.mutate()} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
            {analyze.isPending ? "Queueing…" : "Analyze resume"}
          </button>
          {message && <span role="status" className="text-sm text-slate-600 dark:text-slate-400">{message}</span>}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-bold">Analysis history</h2>
          <div className="mt-4 space-y-2">
            {history.isLoading ? <div role="status" className="space-y-2"><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></div>
              : history.isError ? <div role="alert" className="text-sm text-red-700"><p>{getApiError(history.error)}</p><button onClick={() => history.refetch()} className="mt-2 font-bold underline">Retry</button></div>
              : history.data?.length ? history.data.map((item) => (
                <button key={item.id} onClick={() => setSelected(item)} className={`w-full rounded-xl p-3 text-left ${selected?.id === item.id ? "bg-indigo-50 dark:bg-indigo-950" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <p className="font-semibold">{item.targetRole}</p>
                  <p className="mt-1 text-xs uppercase text-slate-500">{item.status} · {item.score ?? "—"}</p>
                </button>
              )) : <p className="text-sm text-slate-500">No analyses yet.</p>}
          </div>
        </aside>
        <AnalysisResult detail={detail} retry={retry} />
      </div>
    </div>
  );
}

function AnalysisResult({ detail, retry }) {
  if (!detail.data) {
    return <section className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500 dark:border-slate-700">
      {detail.isLoading ? <div role="status" className="w-full max-w-md space-y-3"><div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></div>
        : detail.isError ? <div role="alert" className="text-center text-red-700"><p>{getApiError(detail.error)}</p><button onClick={() => detail.refetch()} className="mt-3 font-bold underline">Retry</button></div>
        : "Upload or select a resume, then run an analysis."}
    </section>;
  }
  const analysis = detail.data;
  if (analysis.status === "PENDING" || analysis.status === "PROCESSING") {
    return <section role="status" className="rounded-2xl bg-indigo-50 p-8 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"><div className="h-3 w-40 animate-pulse rounded bg-indigo-200 dark:bg-indigo-800" /><p className="mt-4">Analysis is {analysis.status.toLowerCase()}…</p></section>;
  }
  if (analysis.status === "FAILED") {
    return <section role="alert" className="rounded-2xl bg-red-50 p-8 text-red-700 dark:bg-red-950 dark:text-red-300"><p>Analysis failed. Retry to process it again.</p><button onClick={() => retry.mutate()} disabled={retry.isPending} className="mt-4 rounded-xl bg-red-700 px-4 py-2 font-bold text-white">{retry.isPending ? "Retrying…" : "Retry analysis"}</button></section>;
  }
  const findings = analysis.findings || {};
  const issues = findings.issues || [];
  const severities = ["critical", "warning", "info"];
  return (
    <section className="space-y-6">
      {findings.parserWarning && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{findings.parserWarning}</div>}
      {findings.notice && <div role="status" className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{findings.notice}</div>}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-xl font-bold">{analysis.targetRole}</h2><p className="mt-1 text-sm text-slate-500">{findings.scoringVersion || findings.scoreFormulaVersion || "ATS_V2_DETERMINISTIC"}</p></div>
          <div className="grid h-32 w-32 place-items-center rounded-full border-12 border-indigo-600 text-center"><div><strong className="text-4xl">{Number(analysis.score || 0).toFixed(0)}</strong><span className="block text-xs">/100</span></div></div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {Object.entries(findings.categories || {}).map(([key, value]) => (
            <div key={key}><div className="flex justify-between text-sm font-semibold"><span>{categoryLabels[key] || key}</span><span>{value}{findings.weights ? `/${findings.weights[key]}` : "/100"}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, findings.weights ? (value / findings.weights[key]) * 100 : value)}%` }} /></div></div>
          ))}
        </div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-bold">Issues</h2>
        <div className="mt-4 space-y-4">
          {severities.map((severity) => {
            const items = issues.filter((item) => item.severity === severity);
            if (!items.length) return null;
            return <div key={severity}><h3 className="text-sm font-bold uppercase">{severity}</h3><ul className="mt-2 space-y-2">{items.map((item, index) => <li key={`${severity}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>{item.issue}</strong><p className="mt-1 text-slate-600 dark:text-slate-300">Fix: {item.fix}</p></li>)}</ul></div>;
          })}
          {!issues.length && <p className="text-sm text-slate-500">No issues identified.</p>}
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <FeedbackCard title="Strengths" items={findings.strengths} />
        <FeedbackCard title="Weaknesses" items={findings.weaknesses} />
        <FeedbackCard title="Missing keywords" items={findings.missingKeywords} />
        <FeedbackCard title="Prioritized tips" items={(findings.prioritizedTips || []).map((item) => `${item.priority}: ${item.tip}`)} />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-xl font-bold">Rewritten bullet suggestions</h2>
        <div className="mt-4 space-y-4">
          {(findings.rewrittenBullets || []).length ? findings.rewrittenBullets.map((item, index) => <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-slate-800"><div><p className="text-xs font-bold uppercase text-slate-500">Before</p><p className="mt-2 text-sm">{item.before}</p></div><div><p className="text-xs font-bold uppercase text-indigo-600">After</p><p className="mt-2 text-sm">{item.after}</p></div></div>) : <p className="text-sm text-slate-500">No rewritten bullets available.</p>}
        </div>
      </section>
    </section>
  );
}

function FeedbackCard({ title, items = [] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold">{title}</h2><ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">{items.length ? items.map((item) => <li key={item} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">{item}</li>) : <li>No items identified.</li>}</ul></section>;
}
