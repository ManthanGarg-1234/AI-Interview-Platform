import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  Code2,
  MessageSquare,
  Pencil,
  Target,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

// ─── Small helpers ────────────────────────────────────────────────────────────

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />;
}

function StatCard({ icon: Icon, label, value, sub, loading, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-xl p-2.5 ${colors[color] || colors.indigo}`}>
        <Icon size={18} />
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-4 h-8 w-20" />
          <Skeleton className="mt-2 h-4 w-28" />
        </>
      ) : (
        <>
          <p className="mt-4 text-2xl font-black text-slate-950">{value ?? "—"}</p>
          <p className="mt-1 text-sm text-slate-500">{label}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </>
      )}
    </div>
  );
}
function ProgressBar({ value, max = 100, color = "bg-indigo-600" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
      <div className="rounded-2xl bg-slate-50 p-4">
        <Icon size={28} className="text-slate-400" />
      </div>
      <p className="mt-4 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {action && (
        <Link
          to={action}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

// ─── Activity timeline entry ──────────────────────────────────────────────────

const activityIcons = {
  CODING_SUBMISSION: Code2,
  AI_INTERVIEW: MessageSquare,
  TOPIC_VIEWED: BookOpen,
};

function ActivityEntry({ item }) {
  const Icon = activityIcons[item.type] || Zap;
  const date = new Date(item.occurredAt);
  const isToday = new Date().toDateString() === date.toDateString();
  const timeLabel = isToday
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
  const content = (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 hover:bg-indigo-50 transition-colors">
      <div className="mt-0.5 rounded-lg bg-white p-1.5 shadow-sm">
        <Icon size={14} className="text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
        <p className="text-xs text-slate-500">{timeLabel}</p>
      </div>
      {item.meta?.verdict && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
            item.meta.verdict === "ACCEPTED"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {item.meta.verdict.replace(/_/g, " ")}
        </span>
      )}
      {item.meta?.score != null && (
        <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
          {Math.round(Number(item.meta.score))}/100
        </span>
      )}
    </div>
  );
  return item.link ? <Link to={item.link}>{content}</Link> : content;
}

// ─── Subject progress card ────────────────────────────────────────────────────

function SubjectCard({ subject }) {
  const total = subject.totalTopics || subject.completed + subject.inProgress;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800 truncate">{subject.name}</p>
        <span className="shrink-0 text-xs font-semibold text-slate-500">
          {subject.completed}/{total}
        </span>
      </div>
      <ProgressBar
        value={subject.completed}
        max={total || 1}
        color={subject.completed === total && total > 0 ? "bg-emerald-500" : "bg-indigo-500"}
      />
      {subject.lastActivityAt && (
        <p className="mt-1.5 text-xs text-slate-400">
          Last studied {new Date(subject.lastActivityAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ─── Rule-based recommendations ──────────────────────────────────────────────

function buildRecommendations(data) {
  const recs = [];
  if (!data) return recs;
  const overview = data.overview || {};
  const studyPlan = data.studyPlan;
  if (overview.codingSolved === 0)
    recs.push({ label: "Solve your first DSA problem", link: "/student/coding", color: "indigo" });

  if (!data.resume?.count)
    recs.push({ label: "Add a resume to get started", link: "/student/profile", color: "sky" });
  else if (data.resume.latestScore == null)
    recs.push({ label: "Analyze your resume", link: "/student/resume-analysis", color: "sky" });

  if (overview.interviewsCompleted === 0)
    recs.push({ label: "Try your first AI mock interview", link: "/student/interviews", color: "emerald" });

  if (!studyPlan?.activePlans)
    recs.push({ label: "Create a personalized study plan", link: "/student/planner", color: "sky" });

  return recs.slice(0, 4);
}

const recColors = {
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  violet: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
  sky: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
  rose: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
};

// ─── Main dashboard page ──────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const query = useQuery({
    queryKey: ["student-dashboard"],
    queryFn: async () => (await api.get("/me/dashboard")).data.data,
    staleTime: 60000,
  });

  const loading = query.isLoading;
  const d = query.data;
  const recs = buildRecommendations(d);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (query.isError) {
    return (
      <div className="max-w-6xl">
        <div className="rounded-2xl bg-red-50 p-6 text-red-700">
          <p className="font-semibold">{getApiError(query.error)}</p>
          <button
            onClick={() => query.refetch()}
            className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-8">
      {/* ── Welcome section ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {loading ? (
              <>
                <Skeleton className="h-8 w-64 bg-indigo-500" />
                <Skeleton className="mt-2 h-4 w-48 bg-indigo-500" />
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black">
                  {greeting}{d?.student?.name ? `, ${d.student.name.split(" ")[0]}` : ""}
                </h1>
                {d?.student?.headline ? (
                  <p className="mt-1 text-indigo-200">{d.student.headline}</p>
                ) : (
                  <p className="mt-1 text-indigo-200">Welcome to your placement preparation workspace.</p>
                )}
              </>
            )}
          </div>

          {/* Profile completion */}
          <div className="rounded-2xl bg-white/15 px-5 py-3 backdrop-blur text-center min-w-36">
            {loading ? (
              <Skeleton className="h-12 w-24 bg-indigo-500" />
            ) : (
              <>
                <p className="text-sm font-semibold text-indigo-100">Profile complete</p>
                <p className="mt-0.5 text-3xl font-black">{d?.student?.profileCompletion ?? 0}%</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-500">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${d?.student?.profileCompletion ?? 0}%` }}
                  />
                </div>
                {d?.student?.profileCompletion < 100 && (
                  <Link to="/student/profile" className="mt-2 block text-xs font-semibold text-indigo-200 hover:text-white underline underline-offset-2">
                    Complete profile →
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Performance overview ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-slate-950 mb-4">Performance overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard icon={Code2} label="Problems solved" value={d?.overview?.codingSolved} loading={loading} color="indigo" />
          <StatCard icon={BriefcaseBusiness} label="Applications" value={d?.overview?.applicationsTotal} loading={loading} color="amber" />
          <StatCard icon={MessageSquare} label="Interviews done" value={d?.overview?.interviewsCompleted} loading={loading} color="emerald" sub={d?.overview?.avgInterviewScore != null ? `Avg ${d.overview.avgInterviewScore}/100` : null} />
          <StatCard icon={Code2} label="Problems attempted" value={d?.overview?.problemsAttempted} loading={loading} color="rose" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-700">Study streak</p>
          <p className="mt-2 text-3xl font-black text-indigo-700">{loading ? "—" : `${d?.dailyStudy?.streakDays ?? 0} days`}</p>
          <p className="mt-1 text-xs text-slate-500">Based on recorded learning activity</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-700">Today's study</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{loading ? "—" : `${d?.dailyStudy?.trackedMinutes ?? 0} min`}</p>
          <p className="mt-1 text-xs text-slate-500">{d?.dailyStudy?.goalMinutes ? `${d.dailyStudy.goalMinutes} min plan goal · ` : "No time goal set · "}{d?.dailyStudy?.completedTasks ?? 0} planned tasks completed</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-700">Placement readiness</p>
          <p className="mt-2 text-3xl font-black text-violet-700">{loading ? "—" : d?.readiness?.score == null ? "Not calculated" : `${Math.round(d.readiness.score)}%`}</p>
          <p className="mt-1 text-xs text-slate-500">{d?.readiness?.calculatedAt ? `Updated ${new Date(d.readiness.calculatedAt).toLocaleDateString()}` : "No saved readiness score is available."}</p>
          <Link to="/student/profile#target-roles" className="mt-2 inline-block text-xs font-bold text-indigo-700">Review profile and role evidence →</Link>
        </div>
      </section>

      {/* ── Three-column content grid ─────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Left col: activity + subject progress ─────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Recent activity</h2>
              <Link to="/student/analytics" className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline">
                Full history <ArrowRight size={14} />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)
              ) : d?.timeline?.length > 0 ? (
                d.timeline.map((item) => <ActivityEntry key={item.id} item={item} />)
              ) : (
                <EmptyState
                  icon={Zap}
                  title="No activity yet"
                  description="Complete a coding problem, interview, or study topic to see your history here."
                  action="/student/coding"
                  actionLabel="Start practicing"
                />
              )}
            </div>
          </section>

          {/* Subject-wise progress */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Topics to revisit</h2><p className="mt-1 text-xs text-slate-500">Based on your saved learning progress</p></div><Link to="/student/subjects" className="text-sm font-bold text-indigo-600">View subjects</Link></div>
            {loading ? <Skeleton className="mt-4 h-14" /> : d?.preparation?.weakTopics?.length ? <div className="mt-4 space-y-2">{d.preparation.weakTopics.map((topic) => <Link key={topic.id} to="/student/subjects" className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span className="font-semibold text-slate-800">{topic.name}<span className="ml-2 text-xs text-slate-500">{topic.subject}</span></span><span className="text-xs font-bold text-amber-700">{Math.round(topic.percent)}% · revisit</span></Link>)}</div> : <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">No topics are currently marked for revision.</p>}
          </section>

          {/* Resume status */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Resume</h2><p className="mt-1 text-xs text-slate-500">Private file status</p></div><Link to="/student/profile" className="text-sm font-bold text-indigo-600">Manage</Link></div>
            {loading ? <Skeleton className="mt-4 h-14" /> : d?.resume?.latest ? <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="font-semibold text-slate-800">{d.resume.latest.title}</p><p className="mt-1 text-sm text-slate-500">{d.resume.latest.scanStatus.replaceAll("_", " ")}{d.resume.latest.version ? ` · version ${d.resume.latest.version}` : ""}</p></div> : <EmptyState icon={BriefcaseBusiness} title="No resume uploaded" description="Add a resume to keep your application materials ready." action="/student/profile" actionLabel="Upload resume" />}
          </section>

          {/* Subject-wise progress */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Subject-wise progress</h2>
              <Link to="/student/subjects" className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline">
                Browse subjects <ArrowRight size={14} />
              </Link>
            </div>
            <div className="mt-4">
              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : d?.subjects?.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.subjects.map((s) => <SubjectCard key={s.id} subject={s} />)}
                </div>
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="No subjects started"
                  description="Choose a subject to start tracking your topic progress."
                  action="/student/subjects"
                  actionLabel="Browse subjects"
                />
              )}
            </div>
          </section>
        </div>

        {/* ── Right col: actions, upcoming, recommendations ──────────────── */}
        <div className="space-y-6">

          {/* Continue preparation */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950 mb-4">Continue preparation</h2>
            <div className="space-y-2">
              {/* Study plan tasks */}
              {d?.studyPlan?.tasks?.length > 0 && (
                <Link
                  to="/student/planner"
                  className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <Target size={15} />
                  Continue study plan — {d.studyPlan.tasks.length} tasks pending
                  <ArrowRight size={13} className="ml-auto" />
                </Link>
              )}

              {/* Always-visible quick links */}
              <Link to="/student/coding" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                <Code2 size={15} className="text-indigo-500" />
                Practice DSA problems
                <ArrowRight size={13} className="ml-auto text-slate-400" />
              </Link>
              <Link to="/student/interviews/new" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                <MessageSquare size={15} className="text-emerald-500" />
                Start a mock interview
                <ArrowRight size={13} className="ml-auto text-slate-400" />
              </Link>
            </div>
          </section>

          {/* Recommended next steps */}
          {(loading || recs.length > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                Based on your data
              </p>
              <h2 className="text-lg font-bold text-slate-950 mb-4">Recommended actions</h2>
              <div className="space-y-2">
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11" />)
                  : recs.map((rec, i) => (
                      <Link
                        key={i}
                        to={rec.link}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition-colors ${recColors[rec.color] || recColors.indigo}`}
                      >
                        <Pencil size={13} className="shrink-0" />
                        {rec.label}
                        <ArrowRight size={13} className="ml-auto shrink-0" />
                      </Link>
                    ))}
              </div>
            </section>
          )}

          {/* Upcoming activities */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950 mb-4">Upcoming</h2>
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 mb-2" />)
            ) : (
              <div className="space-y-2">
                {d?.upcoming?.interviews?.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <CalendarCheck size={14} className="text-indigo-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                    </div>
                    <p className="mt-1 ml-5 text-xs text-slate-500">
                      {new Date(item.scheduledStart).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                ))}
                {!loading && !d?.upcoming?.interviews?.length && (
                  <EmptyState
                    icon={BriefcaseBusiness}
                    title="Nothing scheduled"
                    description="Your upcoming interviews will appear here."
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
