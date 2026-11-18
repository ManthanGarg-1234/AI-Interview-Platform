import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink, ListFilter, Search, Target, Trophy } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const difficulties = ["EASY", "MEDIUM", "HARD"];
const platforms = ["LEETCODE", "GFG", "CODE360", "HACKERRANK", "CODECHEF", "INTERVIEWBIT", "CODEFORCES", "OTHER"];
const statuses = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "ATTEMPTED", label: "Attempted" },
  { value: "SOLVED", label: "Solved" },
  { value: "REVISION_REQUIRED", label: "Review" },
];

function useCodingFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(params.entries()), [params]);
  function update(name, value) {
    const next = new URLSearchParams(params);
    if (value === "" || value == null || value === false) next.delete(name);
    else next.set(name, String(value));
    if (name !== "page") next.delete("page");
    setParams(next, { replace: true });
  }
  function clear() { setParams({}, { replace: true }); }
  return { filters, update, clear };
}

function Stat({ icon: Icon, label, value, to }) {
  const content = <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <Icon size={20} className="text-indigo-600" />
    <p className="mt-4 text-sm text-slate-500">{label}</p>
    <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
  </div>;
  return to ? <Link to={to} className="block transition hover:-translate-y-0.5 hover:shadow-md">{content}</Link> : content;
}

function ProblemRow({ problem, onProgress, onBookmark, pending }) {
  return <article className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <Link to={`/student/coding/problems/${problem.slug}`} className="font-semibold text-indigo-700 hover:underline">{problem.title}</Link>
      <p className="mt-1 text-xs text-slate-500">{problem.platform} · {problem.difficulty.toLowerCase()} · {problem.topics?.map((topic) => topic.name).join(", ") || "Topic not tagged"}</p>
      {problem.sheets?.length > 0 && <p className="mt-1 text-xs text-slate-500">{problem.sheets.map((sheet) => sheet.name).join(" · ")}</p>}
      {!problem.verifiedAt && <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Link not recently verified</span>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Progress for ${problem.title}`} value={problem.progress.status} disabled={pending} onChange={(event) => onProgress(problem.id, event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
      </select>
      <button type="button" aria-label={problem.bookmarked ? `Remove ${problem.title} bookmark` : `Bookmark ${problem.title}`} title={problem.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={() => onBookmark(problem)} className={`rounded-lg border p-2 ${problem.bookmarked ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
        <Bookmark size={18} fill={problem.bookmarked ? "currentColor" : "none"} />
      </button>
      <a href={problem.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
        Open on {problem.platform}<ExternalLink size={14} />
      </a>
    </div>
  </article>;
}

export default function CodingPracticePage() {
  const { filters, update, clear } = useCodingFilters();
  const [activeTab, setActiveTab] = useState(filters.progress ? "problems" : "sheets");
  const client = useQueryClient();
  const queryParams = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([key]) => key !== "page")), [filters]);
  const summary = useQuery({
    queryKey: ["coding-library", "summary"],
    queryFn: async () => (await api.get("/coding/library/progress/summary")).data.data,
  });
  const sheets = useQuery({
    queryKey: ["coding-library", "sheets", queryParams, filters.page],
    queryFn: async () => (await api.get("/coding/library/sheets", { params: { ...queryParams, page: filters.page || 1, pageSize: 12 } })).data.data,
    enabled: activeTab === "sheets",
  });
  const problems = useQuery({
    queryKey: ["coding-library", "problems", queryParams, filters.page],
    queryFn: async () => (await api.get("/coding/library/problems", { params: { ...queryParams, page: filters.page || 1, pageSize: 20 } })).data.data,
    enabled: activeTab === "problems",
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
  const isPending = progress.isPending || bookmark.isPending;
  const pageError = activeTab === "sheets" ? sheets.error : problems.error;
  const pageLoading = activeTab === "sheets" ? sheets.isLoading : problems.isLoading;
  const pageData = activeTab === "sheets" ? sheets.data : problems.data;
  const pages = pageData?.pages || 1;
  const page = Number(filters.page || 1);
  useEffect(() => {
    if (filters.progress) setActiveTab("problems");
  }, [filters.progress]);

  if (summary.isLoading) return <p role="status" className="text-slate-500">Loading placement preparation…</p>;
  if (summary.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(summary.error)}</p><button onClick={() => summary.refetch()} className="mt-3 font-bold underline">Try again</button></section>;

  return <div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Coding preparation</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Placement problem library</h1>
        <p className="mt-2 max-w-3xl text-slate-600">Discover independently curated lists, filter problems on the server, and solve them on their original platforms. CareerPrepAI does not provide an editor or execute code in this workflow.</p>
      </div>
      <Link to="/student/coding/progress" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">View progress analytics</Link>
    </header>

    <section aria-label="Placement problem progress" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={Trophy} label="Solved" value={`${summary.data.totals.solved} / ${summary.data.totals.total}`} />
      <Stat icon={Target} label="Attempted" value={summary.data.totals.attempted} />
      <Stat icon={ListFilter} label="Remaining" value={summary.data.totals.remaining} />
      <Stat icon={Bookmark} label="Revision needed" value={summary.data.totals.revisionRequired} to="/student/coding?progress=REVISION_REQUIRED" />
    </section>

    <div className="mt-8 flex gap-2 border-b border-slate-200">
      {[["sheets", "Practice sheets"], ["problems", "All problems"]].map(([value, label]) => <button key={value} type="button" onClick={() => setActiveTab(value)} className={`border-b-2 px-4 py-3 text-sm font-bold ${activeTab === value ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>)}
    </div>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input value={filters.search || ""} onChange={(event) => update("search", event.target.value)} placeholder="Search sheets or problems" aria-label="Search placement problems" className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3" />
        </label>
        <select aria-label="Filter by difficulty" value={filters.difficulty || ""} onChange={(event) => update("difficulty", event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
          <option value="">All difficulties</option>{difficulties.map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}
        </select>
        <select aria-label="Filter by platform" value={filters.platform || ""} onChange={(event) => update("platform", event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
          <option value="">All platforms</option>{platforms.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {activeTab === "sheets" ? <select aria-label="Filter sheets by completion" value={filters.status || ""} onChange={(event) => update("status", event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
          <option value="">All progress</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>
        </select> : <select aria-label="Filter problems by progress" value={filters.progress || ""} onChange={(event) => update("progress", event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3">
          <option value="">All progress</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>}
        <button type="button" onClick={clear} className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Clear filters</button>
      </div>
      {activeTab === "problems" && <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2"><input type="checkbox" checked={filters.bookmarked === "true"} onChange={(event) => update("bookmarked", event.target.checked ? "true" : "")} />Bookmarked only</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={filters.recent === "true"} onChange={(event) => update("recent", event.target.checked ? "true" : "")} />Recently active</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={filters.unsolved === "true"} onChange={(event) => update("unsolved", event.target.checked ? "true" : "")} />Unsolved</label>
        <label className="flex items-center gap-2">Topic <input value={filters.topic || ""} onChange={(event) => update("topic", event.target.value)} placeholder="e.g. Arrays" className="w-36 rounded-lg border border-slate-300 px-2 py-1" /></label>
        <label className="flex items-center gap-2">Pattern <input value={filters.pattern || ""} onChange={(event) => update("pattern", event.target.value)} placeholder="e.g. Sliding Window" className="w-40 rounded-lg border border-slate-300 px-2 py-1" /></label>
        <label className="flex items-center gap-2">Company <input value={filters.company || ""} onChange={(event) => update("company", event.target.value)} placeholder="Verified tags only" className="w-40 rounded-lg border border-slate-300 px-2 py-1" /></label>
        <label className="flex items-center gap-2">Priority <select value={filters.priority || ""} onChange={(event) => update("priority", event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1"><option value="">Any</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="flex items-center gap-2">Sort <select value={filters.sort || "recommended"} onChange={(event) => update("sort", event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1"><option value="recommended">Recommended</option><option value="title">Title</option><option value="difficulty">Difficulty</option><option value="popular">Popular</option><option value="recent">Recently active</option></select></label>
      </div>}

      <div className="mt-5">
        {pageLoading && <p role="status" className="py-8 text-center text-slate-500">Loading catalogue…</p>}
        {pageError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{getApiError(pageError)}</p><button onClick={() => (activeTab === "sheets" ? sheets.refetch() : problems.refetch())} className="mt-2 font-bold underline">Retry</button></div>}
        {!pageLoading && !pageError && activeTab === "sheets" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(sheets.data?.items || []).map((sheet) => <Link key={sheet.id} to={`/student/coding/sheets/${sheet.slug}`} className="rounded-2xl border border-slate-200 p-5 transition hover:border-indigo-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{sheet.category} · {sheet.source}</p><h2 className="mt-2 text-lg font-bold text-slate-950">{sheet.name}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{sheet.status.replaceAll("_", " ").toLowerCase()}</span></div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{sheet.description}</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500"><span>{sheet.totalProblems} problems</span><span>{sheet.topicCount} topics</span><span>{sheet.solved} solved · {sheet.completionPercent}%</span></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${sheet.completionPercent}%` }} /></div>
          </Link>)}
          {!sheets.data?.items?.length && <p className="col-span-full rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No published placement sheets match these filters. Current catalogue coverage reflects only the lists available to your platform.</p>}
        </div>}
        {!pageLoading && !pageError && activeTab === "problems" && <div>
          {(problems.data?.items || []).map((problem) => <ProblemRow key={problem.id} problem={problem} pending={isPending} onProgress={(id, status) => progress.mutate({ id, status })} onBookmark={(item) => bookmark.mutate(item)} />)}
          {!problems.data?.items?.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No problems match these filters.</p>}
          {(progress.isError || bookmark.isError) && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{getApiError(progress.error || bookmark.error)}</p>}
        </div>}
      </div>
      {pageData?.pages > 1 && <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Page {page} of {pages} · {pageData.total} results</span>
        <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => update("page", page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page >= pages} onClick={() => update("page", page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
      </div>}
    </section>
  </div>;
}
