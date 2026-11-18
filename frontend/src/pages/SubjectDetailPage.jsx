import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function SubjectDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["subject", slug],
    queryFn: async () => {
      const res = await api.get(`/subjects/${slug}`);
      return res.data;
    },
  });

  async function startTopic(topicSlug) {
    try {
      await markProgress.mutateAsync({ topicSlug, status: "IN_PROGRESS" });
      navigate(`/student/subjects/${slug}/topics/${topicSlug}`);
    } catch {
      // The mutation error is rendered below the topic list.
    }
  }

  const markProgress = useMutation({
    mutationFn: ({ topicSlug, status }) => api.post(`/subjects/${slug}/topics/${topicSlug}/progress`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subject", slug] });
      qc.invalidateQueries({ queryKey: ["learning-progress"] });
    },
  });

  if (query.isLoading) return <div className="max-w-4xl space-y-4">{Array.from({length:5}).map((_,i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />)}</div>;
  if (query.isError) return <div className="rounded-2xl bg-red-50 p-6 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button></div>;

  const { data: subject, progress = [] } = query.data;
  const progressByTopic = Object.fromEntries(progress.map((p) => [p.topicId, p]));

  const totalTopics = subject.topics?.length || 0;
  const completedTopics = progress.filter((p) => p.status === "COMPLETED" && p.topicId).length;

  return (
    <div className="max-w-4xl">
      <Link to="/student/subjects" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline">
        <ArrowLeft size={14} /> All subjects
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">{subject.name}</h1>
          <p className="mt-1 text-slate-500">{totalTopics} topics · {completedTopics} completed</p>
        </div>
        {markProgress.isError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{getApiError(markProgress.error)}</p>}
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3 text-center">
          <p className="text-3xl font-black text-indigo-700">
            {totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0}%
          </p>
          <p className="mt-0.5 text-xs font-semibold text-indigo-500">Complete</p>
        </div>
      </div>

      {/* Topics */}
      <div className="mt-6 space-y-3">
        {subject.topics?.map((topic) => {
          const tp = progressByTopic[topic.id];
          const isCompleted = tp?.status === "COMPLETED";
          const isInProgress = tp?.status === "IN_PROGRESS";
          return (
            <div key={topic.id} className={`rounded-2xl border bg-white shadow-sm ${isCompleted ? "border-emerald-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${isCompleted ? "bg-emerald-100" : isInProgress ? "bg-amber-100" : "bg-slate-100"}`}>
                    {isCompleted ? <CheckCircle2 size={15} className="text-emerald-600" /> : <span className="text-xs font-bold text-slate-500">{topic.name[0]}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{topic.name}</p>
                    <p className="text-xs text-slate-500">
                      {topic._count?.problemTopics || 0} coding problems
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isInProgress && !isCompleted && (
                    <button
                      onClick={() => startTopic(topic.slug)}
                      disabled={markProgress.isPending}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {markProgress.isPending ? "Starting…" : "Start"}
                    </button>
                  )}
                  {(isInProgress || isCompleted) && (
                    <Link
                      to={`/student/subjects/${slug}/topics/${topic.slug}`}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      {isCompleted ? "Review" : "Continue"}
                    </Link>
                  )}
                </div>
              </div>

            </div>
          );
        })}
        {subject.topics?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">No topics added to this subject yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
