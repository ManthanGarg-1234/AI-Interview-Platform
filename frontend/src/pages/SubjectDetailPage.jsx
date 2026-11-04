import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, ExternalLink, PlayCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const KIND_ICONS = { VIDEO: PlayCircle, ARTICLE: BookOpen, NOTES: BookOpen, EXTERNAL: ExternalLink, PRACTICE: CheckCircle2 };
const KIND_COLORS = { VIDEO: "text-red-500", ARTICLE: "text-blue-500", NOTES: "text-amber-500", EXTERNAL: "text-slate-500", PRACTICE: "text-emerald-500" };

export default function SubjectDetailPage() {
  const { slug } = useParams();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["subject", slug],
    queryFn: async () => {
      const res = await api.get(`/subjects/${slug}`);
      return res.data;
    },
  });

  const markProgress = useMutation({
    mutationFn: ({ topicSlug, status }) => api.post(`/subjects/${slug}/topics/${topicSlug}/progress`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subject", slug] }),
  });

  const markResource = useMutation({
    mutationFn: (resourceId) => api.post(`/me/resources/${resourceId}/progress`, { percent: 100 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subject", slug] }),
  });

  if (query.isLoading) return <div className="max-w-4xl space-y-4">{Array.from({length:5}).map((_,i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />)}</div>;
  if (query.isError) return <div className="rounded-2xl bg-red-50 p-6 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button></div>;

  const { data: subject, progress = [] } = query.data;
  const progressByTopic = Object.fromEntries(progress.filter((p) => !p.resourceId).map((p) => [p.topicId, p]));
  const progressByResource = Object.fromEntries(progress.filter((p) => p.resourceId).map((p) => [p.resourceId, p]));

  const totalTopics = subject.topics?.length || 0;
  const completedTopics = progress.filter((p) => p.status === "COMPLETED" && p.topicId && !p.resourceId).length;

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
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3 text-center">
          <p className="text-3xl font-black text-indigo-700">
            {totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0}%
          </p>
          <p className="mt-0.5 text-xs font-semibold text-indigo-500">Complete</p>
        </div>
      </div>

      {/* Subject-level resources */}
      {subject.resources?.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Subject overview resources</h2>
          <div className="space-y-2">
            {subject.resources.map((r) => <ResourceRow key={r.id} resource={r} done={!!progressByResource[r.id]} onMark={() => markResource.mutate(r.id)} />)}
          </div>
        </section>
      )}

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
                      {topic._count?.questions > 0 && `${topic._count.questions} questions`}
                      {topic._count?.problemTopics > 0 && ` · ${topic._count.problemTopics} problems`}
                      {topic.resources?.length > 0 && ` · ${topic.resources.length} resources`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isCompleted && (
                    <button
                      onClick={() => markProgress.mutate({ topicSlug: topic.slug, status: isInProgress ? "COMPLETED" : "IN_PROGRESS" })}
                      disabled={markProgress.isPending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${isInProgress ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {isInProgress ? "Mark complete" : "Start"}
                    </button>
                  )}
                  {isCompleted && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Completed</span>}
                </div>
              </div>

              {/* Resources for this topic */}
              {topic.resources?.length > 0 && (
                <div className="border-t border-slate-100 px-5 pb-4">
                  <div className="mt-3 space-y-1.5">
                    {topic.resources.map((r) => <ResourceRow key={r.id} resource={r} done={!!progressByResource[r.id]} onMark={() => markResource.mutate(r.id)} />)}
                  </div>
                </div>
              )}
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

function ResourceRow({ resource, done, onMark }) {
  const Icon = KIND_ICONS[resource.kind] || BookOpen;
  const color = KIND_COLORS[resource.kind] || "text-slate-500";
  return (
    <div className={`flex items-center gap-3 rounded-xl p-2.5 ${done ? "bg-emerald-50" : "hover:bg-slate-50"} transition-colors`}>
      <Icon size={15} className={`shrink-0 ${done ? "text-emerald-600" : color}`} />
      <a href={resource.uri} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm font-medium text-slate-700 hover:text-indigo-600 hover:underline truncate">
        {resource.title}
      </a>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{resource.kind}</span>
      {!done ? (
        <button onClick={onMark} className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors">Done</button>
      ) : (
        <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
      )}
    </div>
  );
}
