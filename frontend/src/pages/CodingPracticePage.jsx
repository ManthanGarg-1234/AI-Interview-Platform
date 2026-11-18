import { Bookmark, BookmarkCheck, Code2, RotateCcw, Search, Target, Trophy, Zap } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const difficulties = ["Easy", "Medium", "Hard"];
const statusOptions = ["All", "Solved", "Attempted", "Unsolved"];

export default function CodingPracticePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("all"); // all | bookmarks
  const [page, setPage] = useState(1);

  const problems = useQuery({
    queryKey: ["coding-problems", { search, difficulty, topic, status, page }],
    queryFn: async () => (await api.get("/coding/problems", { params: { search: search || undefined, difficulty: difficulty || undefined, topic: topic || undefined, status: status || undefined, page } })).data.data,
  });

  const stats = useQuery({ queryKey: ["coding-stats"], queryFn: async () => (await api.get("/coding/stats")).data.data });

  const topics = useQuery({ queryKey: ["coding-topics"], queryFn: async () => (await api.get("/coding/topics")).data.data });

  const bookmarks = useQuery({
    queryKey: ["coding-bookmarks"],
    queryFn: async () => (await api.get("/coding/bookmarks")).data.data,
    enabled: tab === "bookmarks",
  });

  const toggleBookmark = useMutation({
    mutationFn: ({ id, bookmarked }) => bookmarked ? api.delete(`/coding/problems/${id}/bookmark`) : api.post(`/coding/problems/${id}/bookmark`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coding-bookmarks"] }); qc.invalidateQueries({ queryKey: ["coding-problems"] }); },
  });

  // Daily challenge: seed from today's date for determinism
  const todaySeed = new Date().toDateString();
  const daily = useQuery({
    queryKey: ["daily-challenge", todaySeed],
    queryFn: async () => {
      const res = await api.get("/coding/problems", { params: { difficulty: "Medium", page: 1, pageSize: 50 } });
      const all = res.data.data.items;
      if (!all.length) return null;
      const idx = Math.abs([...todaySeed].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0)) % all.length;
      return all[idx];
    },
  });

  const items = tab === "bookmarks" ? (bookmarks.data || []) : (problems.data?.items || []);
  const isLoading = tab === "bookmarks" ? bookmarks.isLoading : problems.isLoading;
  const isError = tab === "bookmarks" ? bookmarks.isError : problems.isError;

  function resetFilters() { setSearch(""); setDifficulty(""); setTopic(""); setStatus(""); setPage(1); }

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Coding lab</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">DSA Practice</h1>
          <p className="mt-2 text-slate-600">Solve problems, build submission history, track your progress.</p>
        </div>
        <Link to="/student/coding/submissions" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Submission history</Link>
        <Link to="/student/dsa-sheets" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100">Preparation sheets</Link>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Trophy} label="Solved" value={stats.data?.totalSolved ?? "—"} sub={`Easy ${stats.data?.byDifficulty?.Easy ?? 0} · Med ${stats.data?.byDifficulty?.Medium ?? 0} · Hard ${stats.data?.byDifficulty?.Hard ?? 0}`} color="indigo" />
        <StatCard icon={Code2} label="Submissions" value={stats.data?.totalSubmissions ?? "—"} color="violet" />
        <StatCard icon={Target} label="Acceptance rate" value={stats.data ? `${stats.data.acceptanceRate}%` : "—"} color="emerald" />
        <StatCard icon={Zap} label="Topics mastered" value={stats.data?.byDifficulty ? Object.values(stats.data.byDifficulty).reduce((a, b) => a + b, 0) : "—"} color="amber" />
      </div>

      {/* Daily challenge */}
      {daily.data && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-2xl">☀️</span>
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">Daily challenge</p>
                <p className="font-bold text-slate-900">{daily.data.title}</p>
              </div>
              <Difficulty value={daily.data.difficulty} />
            </div>
            <Link to={`/student/coding/${daily.data.slug}`} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 transition-colors">
              Solve today
            </Link>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {["all", "bookmarks"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{t}</button>
        ))}
      </div>

      {/* Problem list */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {tab === "all" && (
          <div className="flex flex-wrap gap-3 p-4 border-b border-slate-100">
            <label className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-3 text-slate-400" size={16} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search problems…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
            </label>
            <select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">All difficulties</option>
              {difficulties.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select value={topic} onChange={(e) => { setTopic(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">All topics</option>
              {(topics.data || []).map((t) => <option key={t.id} value={t.name}>{t.name} ({t._count.problemTopics})</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">All statuses</option>
              {statusOptions.slice(1).map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={resetFilters} className="rounded-xl border border-slate-300 px-3 py-2.5 text-slate-500 hover:bg-slate-50" title="Reset filters"><RotateCcw size={15} /></button>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-slate-50 mx-4 my-2 rounded-xl" />)
          ) : isError ? (
            <div className="p-6 text-red-600 text-sm">{getApiError(problems.error || bookmarks.error)}</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {tab === "bookmarks" ? "No bookmarked problems yet. Bookmark problems to revise later." : "No problems match your filters."}
            </div>
          ) : items.map((problem) => (
            <div key={problem.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <StatusDot status={problem.status} />
                <div className="min-w-0">
                  <Link to={`/student/coding/${problem.slug}`} className="font-bold text-slate-900 hover:text-indigo-700 transition-colors truncate block">{problem.title}</Link>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">{Array.isArray(problem.topics) ? problem.topics.join(" · ") : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Difficulty value={problem.difficulty} />
                <span className="text-xs text-slate-400">{problem.attempts} attempts</span>
                <button
                  onClick={() => toggleBookmark.mutate({ id: problem.id, bookmarked: tab === "bookmarks" })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 transition-colors"
                  title="Bookmark"
                >
                  {tab === "bookmarks" ? <BookmarkCheck size={16} className="text-amber-500" /> : <Bookmark size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {tab === "all" && problems.data?.pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
            <button disabled={page === 1} onClick={() => setPage((v) => v - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
            <span className="text-sm text-slate-500">Page {page} of {problems.data.pages}</span>
            <button disabled={page === problems.data.pages} onClick={() => setPage((v) => v + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "indigo" }) {
  const colors = { indigo: "bg-indigo-50 text-indigo-600", violet: "bg-violet-50 text-violet-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600" };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-xl p-2 ${colors[color]}`}><Icon size={16} /></div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-0.5 text-sm text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Difficulty({ value }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${value === "Easy" ? "bg-emerald-50 text-emerald-700" : value === "Medium" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{value}</span>;
}

function StatusDot({ status }) {
  const classes = { SOLVED: "bg-emerald-500", ATTEMPTED: "bg-amber-400", UNSOLVED: "bg-slate-300" };
  return <span className={`shrink-0 h-2.5 w-2.5 rounded-full ${classes[status] || classes.UNSOLVED}`} title={status} />;
}
