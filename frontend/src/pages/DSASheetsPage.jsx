import { useState } from "react";
import { ArrowLeft, ExternalLink, ListChecks } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const statuses = ["UNSOLVED", "ATTEMPTED", "SOLVED", "REVISION"];

export default function DSASheetsPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState({});
  const query = useQuery({
    queryKey: slug ? ["dsa-sheet", slug] : ["dsa-sheets"],
    queryFn: async () => (await api.get(slug ? `/dsa-sheets/${slug}` : "/dsa-sheets")).data.data,
  });
  const update = useMutation({
    mutationFn: ({ entryId, status, note }) => api.put(`/dsa-sheets/${slug}/problems/${entryId}/progress`, { status, notes: note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dsa-sheet", slug] }),
  });

  if (query.isLoading) return <p className="text-slate-500">Loading DSA sheets…</p>;
  if (query.isError) return <div role="alert" className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button type="button" onClick={() => query.refetch()} className="mt-2 font-semibold underline">Retry</button></div>;

  if (!slug) {
    return (
      <section className="max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Coding practice</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">DSA preparation sheets</h1>
        <p className="mt-2 text-slate-600">Track your progress against curated collections. External problems open on their original platform.</p>
        {query.data.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">No published sheets are available yet.</p> : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {query.data.map((sheet) => (
              <li key={sheet.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">{sheet.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{sheet.author || "CareerPrepAI"}{sheet.total > 0 && ` · ${sheet.total} problems`}</p>
                {sheet.description && <p className="mt-3 text-sm text-slate-600">{sheet.description}</p>}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span>{sheet.completed || 0} solved · {sheet.attempted || 0} attempted</span>
                  <Link to={`/student/dsa-sheets/${sheet.slug}`} className="font-bold text-indigo-700 hover:underline">Open sheet</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const sheet = query.data;
  const completed = sheet.problems.filter((entry) => entry.progress.status === "SOLVED").length;
  const attempted = sheet.problems.filter((entry) => ["ATTEMPTED", "REVISION"].includes(entry.progress.status)).length;

  return (
    <section className="max-w-6xl">
      <Link to="/student/dsa-sheets" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 hover:underline"><ArrowLeft size={15} /> All sheets</Link>
      <div className="mt-4">
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Preparation sheet</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{sheet.name}</h1>
        <p className="mt-2 text-slate-600">{sheet.description || "Work through this collection and record progress as you practice."}</p>
        <p className="mt-2 text-sm text-slate-500">{completed} solved · {attempted} attempted · {sheet.problems.length} total</p>
      </div>
      {sheet.problems.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600">This sheet has no problems yet.</p> : (
        <ol className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {sheet.problems.map((entry, index) => {
            const progress = entry.progress;
            const noteValue = notes[entry.id] ?? progress.notes ?? "";
            const href = entry.problem ? `/student/coding/${entry.problem.slug}` : entry.externalUrl;
            return (
              <li key={entry.id} className="grid gap-3 p-4 md:grid-cols-[2rem_minmax(0,1fr)_12rem] md:items-start">
                <span className="pt-2 text-sm font-semibold text-slate-400">{index + 1}.</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{entry.title}</h2>
                    {entry.difficulty && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{entry.difficulty}</span>}
                    {entry.topic && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{entry.topic}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{entry.platform || (entry.problem ? "CareerPrepAI" : "External problem")}</p>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">
                    Personal note
                    <textarea value={noteValue} maxLength={2000} rows={2} onChange={(event) => setNotes({ ...notes, [entry.id]: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="Add a note for your next revision" />
                  </label>
                  <button type="button" onClick={() => update.mutate({ entryId: entry.id, status: progress.status, note: noteValue || null })} disabled={update.isPending} className="mt-1 text-xs font-bold text-indigo-700 disabled:opacity-50">Save note</button>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-600">Progress
                    <select value={progress.status} onChange={(event) => update.mutate({ entryId: entry.id, status: event.target.value, note: noteValue || null })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
                      {statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ").toLowerCase()}</option>)}
                    </select>
                  </label>
                  {href && (
                    entry.problem
                      ? <Link to={href} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700 hover:underline"><ListChecks size={14} /> Practice</Link>
                      : <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700 hover:underline"><ExternalLink size={14} /> Open original problem</a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {update.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(update.error)}</p>}
      {update.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Progress saved.</p>}
    </section>
  );
}
