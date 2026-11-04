import { Code2, Search, Target, Trophy } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const difficulties = ["", "Easy", "Medium", "Hard"];

export default function CodingPracticePage() {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const problems = useQuery({
    queryKey: ["coding-problems", { search, difficulty, page }],
    queryFn: async () => (await api.get("/coding/problems", { params: { search: search || undefined, difficulty: difficulty || undefined, page } })).data.data,
  });
  const stats = useQuery({ queryKey: ["coding-stats"], queryFn: async () => (await api.get("/coding/stats")).data.data });
  const items = problems.data?.items || [];
  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Student coding lab</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Practice problems</h1><p className="mt-2 text-slate-600">Build measurable problem-solving evidence with authenticated, persistent submissions.</p></div>
        <Link to="/student/coding/submissions" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Submission history</Link>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat icon={Trophy} label="Solved" value={stats.data?.totalSolved ?? "—"} />
        <Stat icon={Code2} label="Submissions" value={stats.data?.totalSubmissions ?? "—"} />
        <Stat icon={Target} label="Acceptance rate" value={stats.data ? `${stats.data.acceptanceRate}%` : "—"} />
      </div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search problems or topics" className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3" /></label>
          <select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }} className="rounded-xl border border-slate-300 bg-white px-3 py-3"><option value="">All difficulties</option>{difficulties.slice(1).map((value) => <option key={value}>{value}</option>)}</select>
        </div>
        {problems.isError ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{getApiError(problems.error)}</p><button type="button" onClick={() => problems.refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-2 font-bold">Try again</button></div> : problems.isLoading ? <p className="mt-6 text-slate-500">Loading problems…</p> : items.length === 0 ? <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No published problems match your filters.</p> : <div className="mt-5 divide-y divide-slate-100">{items.map((problem) => <Link key={problem.id} to={`/student/coding/${problem.slug}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-slate-50"><div><div className="flex items-center gap-3"><h2 className="font-bold text-slate-900">{problem.title}</h2><Difficulty value={problem.difficulty} /></div><p className="mt-1 text-sm text-slate-500">{problem.topics.join(" · ")}</p></div><div className="flex items-center gap-4 text-sm"><span className={problem.status === "SOLVED" ? "font-bold text-emerald-600" : "text-slate-500"}>{problem.status.toLowerCase()}</span><span className="text-slate-400">{problem.attempts} attempts</span></div></Link>)}</div>}
        {problems.data?.pages > 1 && <div className="mt-5 flex justify-end gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="px-3 py-2 text-sm text-slate-500">Page {page} of {problems.data.pages}</span><button disabled={page === problems.data.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button></div>}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="text-indigo-600" size={20} /><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>; }
function Difficulty({ value }) { return <span className={`rounded-full px-2 py-1 text-xs font-bold ${value === "Easy" ? "bg-emerald-50 text-emerald-700" : value === "Medium" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{value}</span>; }
