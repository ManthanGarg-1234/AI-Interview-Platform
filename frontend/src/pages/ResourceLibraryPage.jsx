import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function ResourceLibraryPage() {
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["resources", search],
    queryFn: async () => (await api.get("/me/resources", { params: { search: search.trim() || undefined } })).data.data,
  });
  const progress = useMutation({
    mutationFn: ({ id, percent }) => api.post(`/me/resources/${id}/progress`, { percent }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["resources"] }),
  });
  const subjects = useMemo(() => [...new Map((query.data || []).filter((item) => item.subject).map((item) => [item.subject.id, item.subject])).values()], [query.data]);
  const topics = useMemo(() => [...new Map((query.data || []).filter((item) => item.topic && (!subjectId || item.subject?.id === subjectId)).map((item) => [item.topic.id, item.topic])).values()], [query.data, subjectId]);
  const resources = (query.data || []).filter((item) =>
    (!subjectId || item.subject?.id === subjectId)
    && (!topicId || item.topic?.id === topicId));

  if (query.isLoading) return <p role="status">Loading learning resources…</p>;
  if (query.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  return <div className="mx-auto max-w-6xl">
    <header><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Learning library</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Learning resources</h1><p className="mt-2 text-slate-600">Browse published material and track your own progress.</p></header>
    <section aria-label="Resource filters" className="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-3">
      <label className="sr-only" htmlFor="resource-search">Search resources</label>
      <input id="resource-search" value={search} onChange={(event) => { setSearch(event.target.value); setTopicId(""); }} placeholder="Search resources" className="rounded-xl border border-slate-300 p-3" />
      <label className="sr-only" htmlFor="resource-subject">Filter by subject</label>
      <select id="resource-subject" value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setTopicId(""); }} className="rounded-xl border border-slate-300 bg-white p-3"><option value="">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
      <label className="sr-only" htmlFor="resource-topic">Filter by topic</label>
      <select id="resource-topic" value={topicId} onChange={(event) => setTopicId(event.target.value)} className="rounded-xl border border-slate-300 bg-white p-3"><option value="">All topics</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select>
    </section>
    {progress.isError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(progress.error)}</p>}
    {resources.length ? <div className="mt-6 grid gap-4 md:grid-cols-2">
      {resources.map((resource) => {
        const savedProgress = resource.progress?.[0];
        const url = safeExternalUrl(resource.uri);
        return <article key={resource.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase text-indigo-600">{resource.kind}</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">{resource.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{[resource.subject?.name, resource.topic?.name].filter(Boolean).join(" · ") || "General"}</p>
          <p className="mt-4 text-sm text-slate-500">{savedProgress ? `${Math.round(Number(savedProgress.percent))}% complete · ${savedProgress.status.toLowerCase().replaceAll("_", " ")}` : "Not started"}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 hover:underline">Open resource</a> : <span className="text-sm text-slate-500">A valid resource link is unavailable.</span>}
            {!savedProgress && <button onClick={() => progress.mutate({ id: resource.id, percent: 25 })} disabled={progress.isPending} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50">Start learning</button>}
            {savedProgress?.status !== "COMPLETED" && <button onClick={() => progress.mutate({ id: resource.id, percent: 100 })} disabled={progress.isPending} className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Mark complete</button>}
          </div>
        </article>;
      })}
    </div> : <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">No published resources match these filters.</p>}
  </div>;
}
