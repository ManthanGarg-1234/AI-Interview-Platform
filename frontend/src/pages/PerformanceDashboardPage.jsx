import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, getApiError } from "../lib/api";

function activityByDay(activities, days) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
  const counts = new Map(activities.map((item) => [item.occurredAt.slice(0, 10), 0]));
  for (const activity of activities) {
    const key = activity.occurredAt.slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(firstDay);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: counts.get(key) || 0 };
  });
}

function Metric({ label, value, note }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</article>;
}

export default function PerformanceDashboardPage() {
  const [range, setRange] = useState("30");
  const query = useQuery({
    queryKey: ["performance", range],
    queryFn: async () => (await api.get("/me/performance", { params: { range } })).data.data,
  });
  const chartData = useMemo(() => activityByDay(query.data?.activities || [], Number(range)), [query.data, range]);
  if (query.isLoading) return <p role="status">Loading performance…</p>;
  if (query.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  const data = query.data;
  return <div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Performance intelligence</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Your preparation dashboard</h1><p className="mt-2 text-slate-600">Evidence-backed metrics from your recorded activity.</p></div>
      <Link to="/student/coding" className="text-sm font-bold text-indigo-700">Open placement practice</Link>
    </header>
    <section aria-label="Preparation metrics" className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Metric label="Latest resume estimate" value={data.resume.latestScore == null ? "—" : `${data.resume.latestScore}/100`} note="ATS-style estimate, not a hiring decision" />
      <Metric label="Placement problems completed" value={data.coding.solved} note={`${data.coding.inProgress} currently in progress`} />
      <Metric label="AI interview average" value={data.interviews.averageScore == null ? "—" : `${data.interviews.averageScore}/100`} />
    </section>
    <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Recorded activity</h2><p className="mt-1 text-sm text-slate-500">Actions recorded in the platform; no estimated study hours.</p></div><label className="sr-only" htmlFor="performance-range">Activity date range</label><select id="performance-range" value={range} onChange={(event) => setRange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div>
        <div className="mt-5 h-64" role="img" aria-label={`Recorded activity for the last ${range} days`}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} minTickGap={20} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={(value) => new Date(`${value}T12:00:00Z`).toLocaleDateString()} /><Bar dataKey="count" name="Recorded activities" fill="#4f46e5" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Problem-solving progress</h2><p className="mt-1 text-sm text-slate-500">Self-reported placement-sheet completion</p>
        <div className="mt-5 space-y-3">{Object.entries(data.coding.byDifficulty).length ? Object.entries(data.coding.byDifficulty).map(([difficulty, count]) => <div key={difficulty} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{difficulty.toLowerCase()}</span><strong>{count} completed</strong></div>) : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No completed sheet problems yet.</p>}</div>
        <Link to="/student/coding" className="mt-4 inline-block text-sm font-bold text-indigo-700">Continue practice</Link>
      </article>
    </section>
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Recent activity</h2>{data.activities.length ? <ul className="mt-4 space-y-3">{data.activities.slice(0, 8).map((item) => <li key={item.id} className="flex justify-between gap-4 rounded-lg bg-slate-50 p-3 text-sm"><span>{item.type.replaceAll("_", " ")}{item.topic ? ` · ${item.topic}` : ""}</span><time className="shrink-0 text-slate-500">{new Date(item.occurredAt).toLocaleDateString()}</time></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No recent platform activity has been recorded.</p>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Verified profile skills</h2>{data.skills.length ? <ul className="mt-4 flex flex-wrap gap-2">{data.skills.map((skill) => <li key={`${skill.name}-${skill.category}`} title={`${skill.evidenceType}${skill.proficiency == null ? "" : ` · proficiency ${skill.proficiency}/100`}`} className="rounded-full bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">{skill.name}</li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No profile skills are recorded yet.</p>}<Link to="/student/profile" className="mt-4 inline-block text-sm font-bold text-indigo-700">Review profile</Link></article>
    </section>
    <section className="mt-6 rounded-2xl bg-indigo-950 p-6 text-white"><h2 className="text-xl font-bold">Build a consistent preparation routine</h2><div className="mt-4 flex flex-wrap gap-3"><Link to="/student/planner" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-indigo-950">Study planner</Link><Link to="/student/subjects" className="rounded-lg bg-indigo-800 px-4 py-2 text-sm font-bold text-white">Study subjects</Link><Link to="/student/resume-analysis" className="rounded-lg bg-indigo-800 px-4 py-2 text-sm font-bold text-white">Analyze your resume</Link></div></section>
  </div>;
}
