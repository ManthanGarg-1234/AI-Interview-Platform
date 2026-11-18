import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Trophy } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const editorLanguage = { Java: "java", "C++": "cpp", Python: "python", JavaScript: "javascript" };

export default function ContestWorkspacePage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [language, setLanguage] = useState("");
  const [code, setCode] = useState("");
  const [codeSubmissionId, setCodeSubmissionId] = useState(null);
  const workspace = useQuery({
    queryKey: ["contest-workspace", id],
    queryFn: async () => (await api.get(`/contests/${id}/workspace`)).data.data,
  });
  const selected = workspace.data?.problems.find((item) => item.id === selectedId) || workspace.data?.problems[0];
  const availableLanguages = useMemo(() => {
    const contestLanguages = workspace.data?.contest.allowedLanguages || [];
    return (selected?.problem.languageConfigs || [])
      .map((config) => config.language)
      .filter((value) => !contestLanguages.length || contestLanguages.includes(value));
  }, [selected, workspace.data?.contest.allowedLanguages]);

  useEffect(() => {
    if (workspace.data?.problems[0] && !selectedId) setSelectedId(workspace.data.problems[0].id);
  }, [workspace.data, selectedId]);
  useEffect(() => {
    if (availableLanguages.length && !availableLanguages.includes(language)) setLanguage(availableLanguages[0]);
    if (!availableLanguages.length) setLanguage("");
  }, [availableLanguages, language]);
  useEffect(() => {
    const starter = selected?.problem.languageConfigs.find((config) => config.language === language)?.starterCode;
    setCode(starter || "");
    setCodeSubmissionId(null);
  }, [selected?.id, language, selected?.problem.languageConfigs]);

  const submit = useMutation({
    mutationFn: () => api.post(`/contests/${id}/submissions`, {
      contestProblemId: selected.id,
      language,
      sourceCode: code,
      idempotencyKey: crypto.randomUUID(),
    }),
    onSuccess: ({ data }) => {
      setCodeSubmissionId(data.data.codeSubmissionId);
      client.invalidateQueries({ queryKey: ["contest-standings", id] });
    },
  });
  const submission = useQuery({
    queryKey: ["coding-submission", codeSubmissionId],
    queryFn: async () => (await api.get(`/coding/submissions/${codeSubmissionId}`)).data.data,
    enabled: Boolean(codeSubmissionId),
    refetchInterval: (query) => query.state.error || ["COMPLETED", "FAILED"].includes(query.state.data?.status) ? false : 1500,
  });
  const standings = useQuery({
    queryKey: ["contest-standings", id],
    queryFn: async () => (await api.get(`/contests/${id}/standings`)).data.data,
    enabled: workspace.data?.contest.phase === "ENDED",
  });

  if (workspace.isLoading) return <p className="text-slate-500">Loading contest workspace…</p>;
  if (workspace.isError) return (
    <div role="alert" className="max-w-3xl rounded-2xl bg-red-50 p-5 text-red-700">
      <p>{getApiError(workspace.error)}</p>
      <Link to="/student/contests" className="mt-3 inline-block font-bold underline">Back to contests</Link>
    </div>
  );
  const contest = workspace.data.contest;
  const isLive = contest.phase === "LIVE";

  return (
    <main className="max-w-7xl">
      <Link to="/student/contests" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline"><ArrowLeft size={14} /> All contests</Link>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Contest workspace · {contest.phase}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{contest.title}</h1>
          <p className="mt-2 text-sm text-slate-500"><Clock3 size={14} className="mr-1 inline" />Ends {new Date(contest.endsAt).toLocaleString()}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${isLive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {isLive ? "Submissions open" : contest.phase === "UPCOMING" ? "Submissions open when contest starts" : "Contest ended"}
        </span>
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section>
          <label className="block text-sm font-bold text-slate-700">
            Contest problem
            <select value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3">
              {workspace.data.problems.map((item) => <option key={item.id} value={item.id}>{item.sequence}. {item.problem.title} · {item.problem.difficulty}</option>)}
            </select>
          </label>
          {selected ? (
            <article className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-slate-950">{selected.problem.title}</h2>
                <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{selected.points} points</span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.problem.statement}</p>
            </article>
          ) : <p className="mt-3 rounded-xl bg-slate-100 p-4 text-slate-600">This contest has no problems yet.</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
          {selected && availableLanguages.length > 0 ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 p-3">
                <label className="sr-only" htmlFor="contest-language">Programming language</label>
                <select id="contest-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white">
                  {availableLanguages.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <button type="button" onClick={() => setCode(selected.problem.languageConfigs.find((item) => item.language === language)?.starterCode || "")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200">Reset code</button>
              </div>
              <Editor height="500px" theme="vs-dark" language={editorLanguage[language] || "plaintext"} value={code} onChange={(value) => setCode(value || "")} options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }} loading={<p className="p-5 text-slate-300">Loading editor…</p>} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-4">
                <p className="text-xs text-slate-400">{isLive ? "Each submission counts toward the contest limit." : "You can prepare code, but submissions are only accepted during the live contest."}</p>
                <button type="button" disabled={!isLive || !code.trim() || submit.isPending} onClick={() => submit.mutate()} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-40">
                  {submit.isPending ? "Submitting…" : "Submit solution"}
                </button>
              </div>
            </>
          ) : <p className="p-5 text-sm text-slate-300">{selected ? "No programming language is enabled for this problem and contest." : "Select a problem to start coding."}</p>}
          {submit.isError && <p role="alert" className="border-t border-slate-800 bg-red-950 p-4 text-sm text-red-200">{getApiError(submit.error)}</p>}
          {submission.isError && <p role="alert" className="border-t border-slate-800 bg-red-950 p-4 text-sm text-red-200">{getApiError(submission.error)}</p>}
          {submission.data && <div className="border-t border-slate-800 p-4 text-sm text-slate-200"><p className="font-bold">Submission: {submission.data.status} {submission.data.verdict && `· ${submission.data.verdict}`}</p>{submission.data.executionResults?.[0]?.passedTests != null && <p className="mt-1">Passed {submission.data.executionResults[0].passedTests}/{submission.data.executionResults[0].totalTests} tests</p>}</div>}
        </section>
      </div>

      {contest.phase === "ENDED" && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><Trophy size={20} className="text-amber-500" /> Contest standings</h2>
          {standings.isLoading ? <p className="mt-3 text-sm text-slate-500">Loading standings…</p> : standings.isError ? <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(standings.error)}</p> : standings.data?.length ? (
            <ol className="mt-3 divide-y divide-slate-100">{standings.data.map((row) => <li key={row.rank} className={`flex justify-between py-3 text-sm ${row.isCurrentUser ? "font-bold text-indigo-700" : "text-slate-700"}`}><span>#{row.rank} {row.isCurrentUser ? "You" : `Participant ${row.rank}`}</span><span>{row.score} pts · {row.solved} solved</span></li>)}</ol>
          ) : <p className="mt-3 text-sm text-slate-500">No solved submissions yet.</p>}
        </section>
      )}
    </main>
  );
}
