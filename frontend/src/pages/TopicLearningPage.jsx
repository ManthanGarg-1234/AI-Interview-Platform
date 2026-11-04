import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, PlayCircle, Code2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const resourceIcons = { VIDEO: PlayCircle, ARTICLE: BookOpen, NOTES: BookOpen, EXTERNAL: ExternalLink, PRACTICE: CheckCircle2 };

export default function TopicLearningPage() {
  const { slug, topicSlug } = useParams();
  const client = useQueryClient();
  const topicQuery = useQuery({
    queryKey: ["topic", slug, topicSlug],
    queryFn: async () => (await api.get(`/subjects/${slug}/topics/${topicSlug}`)).data,
  });
  const updateTopic = useMutation({
    mutationFn: (status) => api.post(`/subjects/${slug}/topics/${topicSlug}/progress`, { status }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["topic", slug, topicSlug] });
      client.invalidateQueries({ queryKey: ["subject", slug] });
      client.invalidateQueries({ queryKey: ["learning-progress"] });
    },
  });
  const updateResource = useMutation({
    mutationFn: (resourceId) => api.post(`/me/resources/${resourceId}/progress`, { percent: 100 }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["topic", slug, topicSlug] });
      client.invalidateQueries({ queryKey: ["subject", slug] });
      client.invalidateQueries({ queryKey: ["learning-progress"] });
    },
  });

  if (topicQuery.isLoading) return <p className="text-slate-500">Loading topic…</p>;
  if (topicQuery.isError) return (
    <div role="alert" className="max-w-3xl rounded-2xl bg-red-50 p-6 text-red-700">
      <p>{getApiError(topicQuery.error)}</p>
      <button onClick={() => topicQuery.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button>
    </div>
  );

  const { data: topic, progress = [] } = topicQuery.data;
  const topicProgress = progress.find((item) => !item.resourceId);
  const resourceProgress = new Map(progress.filter((item) => item.resourceId).map((item) => [item.resourceId, item]));
  const completed = topicProgress?.status === "COMPLETED";
  const resources = [
    ...(topic.resources || []),
    ...(topic.subtopics || []).flatMap((subtopic) => subtopic.resources || []),
  ];

  return (
    <main className="max-w-4xl">
      <Link to={`/student/subjects/${slug}`} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline">
        <ArrowLeft size={14} /> {topic.subject.name}
      </Link>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Topic learning path</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">{topic.name}</h1>
            <p className="mt-2 text-slate-600">{resources.length} learning resources · {topic.problemTopics.length} practice problems</p>
          </div>
          {completed ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Completed</span>
          ) : (
            <button
              type="button"
              onClick={() => updateTopic.mutate("COMPLETED")}
              disabled={updateTopic.isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {updateTopic.isPending ? "Saving…" : "Mark topic complete"}
            </button>
          )}
        </div>
        {updateTopic.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(updateTopic.error)}</p>}
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-bold text-slate-950">Learning resources</h2>
        {resources.length ? (
          <div className="mt-3 space-y-3">
            {resources.map((resource) => {
              const Icon = resourceIcons[resource.kind] || BookOpen;
              const done = resourceProgress.get(resource.id)?.status === "COMPLETED";
              return (
                <article key={resource.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <Icon size={18} className={done ? "text-emerald-600" : "text-indigo-600"} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{resource.title}</p>
                    <p className="text-xs text-slate-500">{resource.kind}</p>
                  </div>
                  <a href={resource.uri} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                    Open <ExternalLink size={13} className="ml-1 inline" />
                  </a>
                  {done ? (
                    <span className="text-sm font-semibold text-emerald-700">Done</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateResource.mutate(resource.id)}
                      disabled={updateResource.isPending}
                      className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                    >
                      Mark done
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No resources have been added to this topic yet. You can still mark the topic complete when you have studied it.
          </p>
        )}
        {updateResource.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(updateResource.error)}</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-slate-950">Practice problems</h2>
        {topic.problemTopics.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {topic.problemTopics.map((problem) => (
              <Link key={problem.id} to={`/student/coding/${problem.slug}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-300">
                <Code2 size={18} className="text-indigo-600" />
                <span className="flex-1 font-semibold text-slate-900">{problem.title}</span>
                <span className="text-xs text-slate-500">{problem.difficulty}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No linked practice problems yet.</p>
        )}
      </section>
    </main>
  );
}
