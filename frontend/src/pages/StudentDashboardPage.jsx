import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, getApiError } from "../lib/api";

const dateTime = (value, timezone) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  ...(timezone ? { timeZone: timezone } : {}),
}).format(new Date(value));

function Metric({ label, value, hint, to }) {
  const content = <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    {hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>}
  </div>;
  return to ? <Link to={to} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">{content}</Link> : content;
}

export default function StudentDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["student-dashboard"],
    queryFn: async () => (await api.get("/me/dashboard")).data.data,
  });

  if (dashboard.isLoading) return <p role="status" className="text-slate-500">Loading your career overview…</p>;
  if (dashboard.isError) return <section className="rounded-2xl bg-red-50 p-6 text-red-700">
    <p>{getApiError(dashboard.error)}</p>
    <button onClick={() => dashboard.refetch()} className="mt-3 font-bold underline">Retry</button>
  </section>;

  const data = dashboard.data;
  const applicationCount = Object.values(data.applications.statusCounts).reduce((sum, count) => sum + count, 0);
  const studyPercent = data.studyPlan.totalTasks
    ? Math.round((data.studyPlan.completedTasks / data.studyPlan.totalTasks) * 100)
    : null;

  return <div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Student dashboard</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Welcome back{data.profile.name ? `, ${data.profile.name}` : ""}</h1>
        <p className="mt-2 text-slate-600">A snapshot of your recorded preparation and next steps.</p>
      </div>
      <Link to="/student/profile" className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">Improve your profile</Link>
    </header>

    <section aria-label="Career preparation metrics" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Profile completion" value={`${data.profile.completionPercent}%`} to="/student/profile" />
      <Metric label="Resume analyses" value={data.resume.count} hint={data.resume.latestScore == null ? "No scored analysis yet" : `Latest estimated score: ${data.resume.latestScore}/100`} to="/student/resume-analysis" />
      <Metric label="AI interviews" value={data.interviews.completed} hint={data.interviews.averageScore == null ? "No completed interviews yet" : `Average score: ${data.interviews.averageScore}/100`} to="/student/interviews" />
      <Metric label="Job applications" value={applicationCount} hint={`${data.notifications.unread} unread notifications`} to="/student/jobs" />
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold text-slate-950">Weekly learning activity</h2><p className="mt-1 text-sm text-slate-500">Recorded activity only; no estimated study hours.</p></div>
          <Link to="/student/analytics" className="text-sm font-bold text-indigo-700">View performance</Link>
        </div>
        <div className="mt-5 h-64" role="img" aria-label="Recorded learning activity for the last seven days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklyActivity} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={(value) => dateTime(`${value}T12:00:00`)} />
              <Bar dataKey="count" name="Recorded activities" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold text-slate-950">Study plan</h2><p className="mt-1 text-sm text-slate-500">{data.studyPlan.activePlans} active plan(s)</p></div>
          <Link to="/student/planner" className="text-sm font-bold text-indigo-700">Open planner</Link>
        </div>
        {studyPercent == null
          ? <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No study tasks are recorded yet.</p>
          : <div className="mt-6">
            <div className="flex justify-between text-sm"><span>Completed tasks</span><strong>{data.studyPlan.completedTasks}/{data.studyPlan.totalTasks}</strong></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${studyPercent}%` }} /></div>
            <p className="mt-2 text-sm text-slate-500">{studyPercent}% complete</p>
          </div>}
        <h3 className="mt-6 font-semibold text-slate-900">Application statuses</h3>
        {applicationCount
          ? <div className="mt-3 flex flex-wrap gap-2">{Object.entries(data.applications.statusCounts).map(([status, count]) => <span key={status} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{status.replaceAll("_", " ")} · {count}</span>)}</div>
          : <p className="mt-2 text-sm text-slate-500">No applications recorded yet.</p>}
      </article>
    </section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-950">Upcoming recruiter interviews</h2><Link to="/student/recruiter-interviews" className="text-sm font-bold text-indigo-700">View all</Link></div>
        {data.upcomingInterviews.length
          ? <div className="mt-4 space-y-3">{data.upcomingInterviews.map((item) => <Link key={item.id} to="/student/recruiter-interviews" className="block rounded-xl bg-slate-50 p-4 hover:bg-indigo-50"><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.company.name} · {item.application.job.title}</p><p className="mt-1 text-xs text-slate-500">{dateTime(item.scheduledStart, item.timezone)} ({item.timezone})</p></Link>)}</div>
          : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No upcoming recruiter interviews.</p>}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-950">Assessments to complete</h2><Link to="/student/assessments" className="text-sm font-bold text-indigo-700">View assessments</Link></div>
        {data.assessments.upcoming.length
          ? <div className="mt-4 space-y-3">{data.assessments.upcoming.map((item) => <Link key={item.id} to="/student/assessments" className="flex justify-between gap-3 rounded-xl bg-slate-50 p-4 hover:bg-indigo-50"><span className="font-semibold text-slate-900">{item.assessment.title}</span><span className="shrink-0 text-xs text-slate-500">{item.dueAt ? `Due ${dateTime(item.dueAt)}` : item.status}</span></Link>)}</div>
          : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No open assigned assessments.</p>}
      </article>
    </section>

    <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-950">Recent activity</h2><Link to="/student/analytics" className="text-sm font-bold text-indigo-700">Performance</Link></div>
        {data.recentActivity.length
          ? <ul className="mt-4 space-y-3">{data.recentActivity.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3"><span className="text-sm font-medium text-slate-800">{item.type.replaceAll("_", " ")}{item.topic ? ` · ${item.topic}` : ""}</span><time className="shrink-0 text-xs text-slate-500">{dateTime(item.occurredAt)}</time></li>)}</ul>
          : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No recent learning activity has been recorded.</p>}
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Recommended next actions</h2>
        {data.recommendations.length
          ? <div className="mt-4 space-y-3">{data.recommendations.map((item) => <Link key={item.href + item.label} to={item.href} className="block rounded-xl bg-indigo-50 p-4 hover:bg-indigo-100"><p className="font-semibold text-indigo-900">{item.label}</p><p className="mt-1 text-sm text-indigo-800">{item.reason}</p></Link>)}</div>
          : <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">You have no immediate recommendations based on the data currently available.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/student/planner" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Study planner</Link>
          <Link to="/student/jobs" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Explore jobs</Link>
          <Link to="/student/interviews" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">AI interview</Link>
        </div>
      </article>
    </section>
  </div>;
}
