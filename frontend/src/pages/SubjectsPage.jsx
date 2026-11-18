import { BookOpen, ChevronRight, Clock, Code2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";
import { useQuery as useProgressQuery } from "@tanstack/react-query";

const SUBJECT_ICONS = {
  dsa: "🧩", "web-development": "🌐", "computer-networks": "🔗",
  "operating-systems": "💻", linux: "🐧", dbms: "🗄️", sql: "📊",
  "system-design": "🏗️", oop: "📦", java: "☕", aptitude: "🧮",
  communication: "🗣️", hr: "🤝", git: "🔧",
};

function SubjectCard({ subject, progress }) {
  const total = subject._count?.topics || 0;
  const topicProgress = progress?.filter((p) => p.topic?.subject?.slug === subject.slug && !p.resourceId) || [];
  const completed = topicProgress.filter((p) => p.status === "COMPLETED").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const icon = SUBJECT_ICONS[subject.slug] || "📚";

  return (
    <Link
      to={`/student/subjects/${subject.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{subject.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{total} topic{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 text-slate-400 group-hover:text-indigo-500 transition-colors" />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1.5">
          <span>{completed}/{total} completed</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-3 text-xs text-slate-500">
        {subject._count?.resources > 0 && <span className="flex items-center gap-1"><FileText size={11} />{subject._count.resources} resources</span>}
      </div>
    </Link>
  );
}

export default function SubjectsPage() {
  const subjects = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get("/subjects")).data.data,
  });
  const progress = useProgressQuery({
    queryKey: ["learning-progress"],
    queryFn: async () => (await api.get("/subjects/me/progress")).data.data,
  });

  if (subjects.isError) return (
    <div className="rounded-2xl bg-red-50 p-6 text-red-700">
      <p>{getApiError(subjects.error)}</p>
      <button onClick={() => subjects.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button>
    </div>
  );

  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Learning centre</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Subject-wise preparation</h1>
          <p className="mt-2 text-slate-600">Structured learning paths for every topic that matters for placements.</p>
        </div>
      </div>

      {subjects.isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : subjects.data?.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <BookOpen size={36} className="text-slate-400" />
          <p className="mt-4 font-semibold text-slate-700">No subjects available yet</p>
          <p className="mt-1 text-sm text-slate-500">An administrator can add subjects and learning content.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subjects.data.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} progress={progress.data || []} />
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950 mb-4">More ways to prepare</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/student/coding" className="flex items-center gap-3 rounded-xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors">
            <Code2 size={18} /> DSA coding practice
          </Link>
          <Link to="/student/assessments" className="flex items-center gap-3 rounded-xl bg-violet-50 p-4 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors">
            <FileText size={18} /> Topic quizzes
          </Link>
          <Link to="/student/resources" className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
            <BookOpen size={18} /> Resource library
          </Link>
        </div>
      </div>
    </div>
  );
}
