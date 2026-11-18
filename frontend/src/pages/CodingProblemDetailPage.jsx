import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink, Save } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const statuses = [
  ["NOT_STARTED", "Not started"],
  ["ATTEMPTED", "Attempted"],
  ["SOLVED", "Solved"],
  ["REVISION_REQUIRED", "Review"],
];

export default function CodingProblemDetailPage() {
  const { slug } = useParams();
  const client = useQueryClient();
  const [notes, setNotes] = useState({});
  const query = useQuery({
    queryKey: ["coding-library", "problem", slug],
    queryFn: async () => (await api.get(`/coding/library/problems/${slug}`)).data.data,
  });
  const problem = query.data;
  const progress = useMutation({
    mutationFn: (status) => api.put(`/coding/library/problems/${problem.id}/progress`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coding-library"] }),
  });
  const bookmark = useMutation({
    mutationFn: () => problem.bookmarked
      ? api.delete(`/coding/library/problems/${problem.id}/bookmark`)
      : api.post(`/coding/library/problems/${problem.id}/bookmark`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coding-library"] }),
  });
  const saveNote = useMutation({
    mutationFn: (value) => api.put(`/coding/library/problems/${problem.id}/note`, { note: value }),
    onSuccess: ({ data }) => {
      setNotes((current) => ({ ...current, [problem.id]: data.data.note }));
      client.invalidateQueries({ queryKey: ["coding-library", "problem", slug] });
    },
  });

  if (query.isLoading) return <p role="status" className="text-slate-500">Loading problem…</p>;
  if (query.isError) return <section role="alert" className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><Link className="mt-3 inline-block font-bold underline" to="/student/coding">Back to problem library</Link></section>;

  const currentNote = notes[problem.id] ?? problem.note ?? "";
  return <div className="mx-auto max-w-4xl">
    <Link to="/student/coding" className="text-sm font-bold text-indigo-700 hover:underline">← Back to placement library</Link>
    <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">{problem.platform} · {problem.difficulty.toLowerCase()}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{problem.title}</h1>
          <p className="mt-3 text-slate-600">{problem.summary || "Curated external placement problem. Use the original platform for the problem statement and solution workflow."}</p>
        </div>
        <button type="button" onClick={() => bookmark.mutate()} disabled={bookmark.isPending} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${problem.bookmarked ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-700"}`}><Bookmark size={17} fill={problem.bookmarked ? "currentColor" : "none"} />{problem.bookmarked ? "Bookmarked" : "Bookmark"}</button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {problem.topics.map((topic) => <span key={topic.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{topic.name}</span>)}
        {problem.patterns.map((pattern) => <span key={pattern.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{pattern.name}</span>)}
        {problem.companies.map((company) => <a key={company.companyName} href={company.evidenceUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{company.companyName} · verified source</a>)}
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your progress</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select aria-label="Update problem progress" value={problem.progress.status} disabled={progress.isPending} onChange={(event) => progress.mutate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="text-sm text-slate-500">{problem.progress.attempts} recorded attempt(s)</span>
          {problem.progress.solvedAt && <span className="text-sm text-emerald-700">Solved {new Date(problem.progress.solvedAt).toLocaleDateString()}</span>}
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-950">Practice on the original platform</h2>
        <p className="mt-1 text-sm text-slate-600">This page links to the external problem only. Code stays on that platform; CareerPrepAI does not edit, submit, or execute code here.</p>
        {!problem.verifiedAt && <p className="mt-2 text-sm font-semibold text-amber-700">This link has not been recently verified by an administrator. Check the destination before signing in there.</p>}
        <a href={problem.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">Open {problem.platform}<ExternalLink size={16} /></a>
        <p className="mt-3 break-all text-xs text-slate-500">Attribution: {problem.attribution || "Independently curated external link"}</p>
      </section>

      <section className="mt-6">
        <label htmlFor="private-note" className="font-bold text-slate-950">Private practice note</label>
        <p className="mt-1 text-sm text-slate-600">Only you can see this note.</p>
        <textarea id="private-note" rows={5} maxLength={5000} value={currentNote} onChange={(event) => setNotes((current) => ({ ...current, [problem.id]: event.target.value }))} className="mt-3 w-full rounded-xl border border-slate-300 p-3" placeholder="Record an insight, edge case, or reminder for your next review." />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{currentNote.length}/5000</span>
          <button type="button" onClick={() => saveNote.mutate(currentNote)} disabled={saveNote.isPending} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save size={16} />{saveNote.isSuccess ? "Saved" : "Save note"}</button>
        </div>
      </section>
      {(progress.isError || bookmark.isError || saveNote.isError) && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(progress.error || bookmark.error || saveNote.error)}</p>}
    </article>
  </div>;
}
