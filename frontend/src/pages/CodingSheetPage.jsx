import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Play, RotateCcw, Search, Star } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const statuses = [
  ["NOT_STARTED", "Not started"],
  ["ATTEMPTED", "Attempted"],
  ["SOLVED", "Solved"],
  ["REVISION_REQUIRED", "Review"],
];

export default function CodingSheetPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recommended");
  const client = useQueryClient();
  const filters = { page, pageSize: 50, search, topic, difficulty, platform, progress: status, sort };
  const sheetQuery = useQuery({
    queryKey: ["coding-library", "sheet", slug, filters],
    queryFn: async () => (await api.get(`/coding/library/sheets/${slug}`, {
      params: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")),
    })).data.data,
  });
  const start = useMutation({
    mutationFn: () => api.post(`/coding/library/sheets/${slug}/start`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coding-library"] }),
  });
  const progress = useMutation({
    mutationFn: ({ id, status }) => api.put(`/coding/library/problems/${id}/progress`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coding-library"] }),
  });
  const bookmark = useMutation({
    mutationFn: (problem) => problem.bookmarked
      ? api.delete(`/coding/library/problems/${problem.id}/bookmark`)
      : api.post(`/coding/library/problems/${problem.id}/bookmark`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coding-library"] }),
  });

  function updateFilter(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function resetFilters() {
    setSearch("");
    setTopic("");
    setDifficulty("");
    setPlatform("");
    setStatus("");
    setSort("recommended");
    setPage(1);
  }

  if (sheetQuery.isLoading) return <p role="status" className="text-slate-500">Loading sheet…</p>;
  if (sheetQuery.isError) return <section role="alert" className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(sheetQuery.error)}</p><Link className="mt-3 inline-block font-bold underline" to="/student/coding">Back to problem library</Link></section>;

  const { sheet, items, total, pages } = sheetQuery.data;
  return <div className="mx-auto max-w-6xl">
    <Link to="/student/coding" className="text-sm font-bold text-indigo-700 hover:underline">← Back to placement library</Link>
    <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">{sheet.category} · {sheet.source}</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">{sheet.name}</h1>
      <p className="mt-3 max-w-3xl text-slate-600">{sheet.description}</p>
      <p className="mt-4 text-sm text-slate-500">{total} matching problems · External platform practice only</p>
      <button type="button" onClick={() => start.mutate()} disabled={start.isPending} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Play size={16} />{start.isSuccess ? "Tracking started" : "Start tracking"}</button>
      {start.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(start.error)}</p>}
    </header>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div aria-label="Filter problems" className="mb-3 grid gap-3 border-b border-slate-100 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2">
          <Search aria-hidden="true" className="absolute left-3 top-3 text-slate-400" size={16} />
          <input aria-label="Search problems" value={search} onChange={updateFilter(setSearch)} placeholder="Search problems…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
        </label>
        <label className="sr-only" htmlFor="problem-topic">Topic</label>
        <input id="problem-topic" value={topic} onChange={updateFilter(setTopic)} placeholder="Topic (e.g. Arrays)" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <label className="sr-only" htmlFor="problem-difficulty">Difficulty</label>
        <select id="problem-difficulty" value={difficulty} onChange={updateFilter(setDifficulty)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <label className="sr-only" htmlFor="problem-platform">Platform</label>
        <select id="problem-platform" value={platform} onChange={updateFilter(setPlatform)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All platforms</option>
          <option value="LEETCODE">LeetCode</option>
          <option value="GFG">GeeksforGeeks</option>
          <option value="CODE360">Code360</option>
          <option value="HACKERRANK">HackerRank</option>
          <option value="CODECHEF">CodeChef</option>
          <option value="INTERVIEWBIT">InterviewBit</option>
          <option value="CODEFORCES">Codeforces</option>
        </select>
        <label className="sr-only" htmlFor="problem-progress">Progress</label>
        <select id="problem-progress" value={status} onChange={updateFilter(setStatus)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All progress</option>
          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="sr-only" htmlFor="problem-sort">Sort problems</label>
        <select id="problem-sort" value={sort} onChange={updateFilter(setSort)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="recommended">Recommended order</option>
          <option value="title">Title</option>
          <option value="difficulty">Difficulty</option>
          <option value="popular">Popular</option>
          <option value="recent">Recently practiced</option>
        </select>
        <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={15} /> Reset filters</button>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((problem) => <article key={problem.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{problem.sheetOrder}. {problem.sheetTopic.name} · {problem.difficulty.toLowerCase()} · {problem.platform}</p>
            <Link to={`/student/coding/problems/${problem.slug}`} className="mt-1 inline-block font-semibold text-indigo-700 hover:underline">{problem.title}</Link>
            {problem.summary && <p className="mt-1 text-sm text-slate-600">{problem.summary}</p>}
            {!problem.verifiedAt && <p className="mt-1 text-xs font-medium text-amber-700">External link has not been recently verified.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`Progress for ${problem.title}`} value={problem.progress.status} disabled={progress.isPending} onChange={(event) => progress.mutate({ id: problem.id, status: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" aria-label={problem.bookmarked ? `Remove ${problem.title} bookmark` : `Bookmark ${problem.title}`} onClick={() => bookmark.mutate(problem)} className={`rounded-lg border p-2 ${problem.bookmarked ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-500"}`}><Star size={17} fill={problem.bookmarked ? "currentColor" : "none"} /></button>
            <a href={problem.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Solve externally<ExternalLink size={14} /></a>
          </div>
        </article>)}
        {!items.length && <p className="py-8 text-center text-sm text-slate-500">No published problems are currently associated with this sheet.</p>}
      </div>
      {(progress.isError || bookmark.isError) && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(progress.error || bookmark.error)}</p>}
      {pages > 1 && <div className="mt-4 flex justify-between border-t border-slate-100 pt-4"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span className="self-center text-sm text-slate-500">Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
    </section>
  </div>;
}
