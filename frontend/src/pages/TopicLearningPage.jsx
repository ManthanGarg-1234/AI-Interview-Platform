import { ArrowLeft, CheckCircle2, Code2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

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
  if (topicQuery.isLoading) return <p className="text-slate-500">Loading topic…</p>;
  if (topicQuery.isError) return (
    <div role="alert" className="max-w-3xl rounded-2xl bg-red-50 p-6 text-red-700">
      <p>{getApiError(topicQuery.error)}</p>
      <button onClick={() => topicQuery.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button>
    </div>
  );

  const { data: topic, progress = [] } = topicQuery.data;
  const topicProgress = progress[0];
  const completed = topicProgress?.status === "COMPLETED";

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
            <p className="mt-2 text-slate-600">{topic.problemTopics.length} practice problems</p>
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
