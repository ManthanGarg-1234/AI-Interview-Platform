import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

function Metric({ label, value, note }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p>{note && <p className="mt-2 text-sm text-slate-500">{note}</p>}</article>;
}

export default function CodingProgressPage() {
  const query = useQuery({
    queryKey: ["coding-library", "summary"],
    queryFn: async () => (await api.get("/coding/library/progress/summary")).data.data,
  });
  if (query.isLoading) return <p role="status" className="text-slate-500">Loading practice analytics…</p>;
  if (query.isError) return <section role="alert" className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-3 font-bold underline">Retry</button></section>;

  const { totals, difficulty, platform, sheetProgress, topics, weeklyActivity, monthlyActivity, strongTopics, weakTopics } = query.data;
  const difficultyData = Object.entries(difficulty).map(([name, value]) => ({ name, ...value }));
  const platformData = Object.entries(platform).map(([name, count]) => ({ name, count }));
  return <div className="mx-auto max-w-7xl">
    <Link to="/student/coding" className="text-sm font-bold text-indigo-700 hover:underline">← Back to problem library</Link>
    <header className="mt-5"><p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Practice analytics</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Placement problem progress</h1><p className="mt-2 text-slate-600">Metrics reflect your manually recorded practice states; they do not represent code submissions or external-platform activity.</p></header>
    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Published unique problems" value={totals.total} />
      <Metric label="Attempted or reviewed" value={totals.attempted} />
      <Metric label="Solved" value={totals.solved} note={`${totals.completionPercent}% of available problems`} />
      <Metric label="Remaining" value={totals.remaining} note={`${totals.revisionRequired} marked for review`} />
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Recorded practice this week</h2>
        <div className="mt-4 h-64" role="img" aria-label="Recorded problem practice activity over the last seven days">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={weeklyActivity} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Recorded updates" fill="#4f46e5" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Progress by difficulty</h2>
        <div className="mt-4 h-64" role="img" aria-label="Solved and attempted problems by difficulty">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={difficultyData} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="solved" name="Solved" fill="#059669" radius={[6, 6, 0, 0]} /><Bar dataKey="attempted" name="Attempted" fill="#6366f1" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      </article>
    </section>
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Sheet completion</h2>
        <div className="mt-4 space-y-4">{sheetProgress.map((sheet) => <div key={sheet.id}><div className="flex justify-between gap-3 text-sm"><Link to={`/student/coding/sheets/${sheet.slug}`} className="font-semibold text-indigo-700 hover:underline">{sheet.name}</Link><span className="text-slate-500">{sheet.solved}/{sheet.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${sheet.completionPercent}%` }} /></div></div>)}
          {!sheetProgress.length && <p className="text-sm text-slate-500">No published sheets are available yet.</p>}
        </div>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Topic recommendations</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><h3 className="text-sm font-bold text-emerald-700">Strong topics</h3><div className="mt-2 space-y-2">{strongTopics.map((topic) => <p key={topic.name} className="rounded-lg bg-emerald-50 p-3 text-sm">{topic.name} · {topic.completionPercent}%</p>)}{!strongTopics.length && <p className="text-sm text-slate-500">Not enough recorded practice yet.</p>}</div></div>
          <div><h3 className="text-sm font-bold text-amber-700">Needs practice</h3><div className="mt-2 space-y-2">{weakTopics.map((topic) => <p key={topic.name} className="rounded-lg bg-amber-50 p-3 text-sm">{topic.name} · {topic.completionPercent}%</p>)}{!weakTopics.length && <p className="text-sm text-slate-500">No weak topics identified from current data.</p>}</div></div>
        </div>
      </article>
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Catalogue coverage</h2>
      <p className="mt-1 text-sm text-slate-500">Only the currently curated and published records are included; no external sheet coverage is implied.</p>
      <div className="mt-4 flex flex-wrap gap-2">{platformData.map((item) => <span key={item.name} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{item.name} · {item.count}</span>)}</div>
      <p className="mt-4 text-xs text-slate-500">Recorded monthly activity: {monthlyActivity.map((item) => `${item.month}: ${item.count}`).join(" · ") || "none"}</p>
      {topics.length > 0 && <p className="mt-3 text-sm text-slate-600">Tracked topics: {topics.map((item) => item.name).join(", ")}</p>}
    </section>
  </div>;
}
