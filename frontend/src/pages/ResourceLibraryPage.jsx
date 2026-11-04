import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ExternalLink, PlayCircle } from "lucide-react";
import { api, getApiError } from "../lib/api";

const kinds = ["ALL", "ARTICLE", "VIDEO", "NOTES", "PRACTICE", "EXTERNAL"];
const icons = { VIDEO: PlayCircle, ARTICLE: BookOpen, NOTES: BookOpen, PRACTICE: CheckCircle2, EXTERNAL: ExternalLink };

export default function ResourceLibraryPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("ALL");
  const [progressFilter, setProgressFilter] = useState("ALL");
  const deferredSearch = useDeferredValue(search.trim());
  const query = useQuery({
    queryKey: ["resources", deferredSearch, kind],
    queryFn: async () => (await api.get(`/me/resources?${new URLSearchParams({
      ...(deferredSearch ? { search: deferredSearch } : {}),
      ...(kind !== "ALL" ? { kind } : {}),
    })}`)).data.data,
  });
  const progress = useMutation({
    mutationFn: (id) => api.post(`/me/resources/${id}/progress`, { percent: 100 }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["resources"] }),
  });

  const resources = (query.data || []).filter((resource) => (
    progressFilter === "ALL"
    || (progressFilter === "COMPLETED" && resource.progress.status === "COMPLETED")
    || (progressFilter === "TO_DO" && resource.progress.status !== "COMPLETED")
  ));
  const completed = (query.data || []).filter((resource) => resource.progress.status === "COMPLETED").length;

  return (
    <main className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Learning centre</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Learning resources</h1>
          <p className="mt-2 text-slate-600">Find trusted resources, save your progress, and pick up where you left off.</p>
        </div>
        <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
          {completed} completed
        </p>
      </div>

      <section className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-1">
          Search resources
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try algorithms or interviews" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Resource type
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            {kinds.map((value) => <option key={value} value={value}>{value === "ALL" ? "All types" : value.toLowerCase()}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Progress
          <select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            <option value="ALL">All resources</option>
            <option value="TO_DO">Not completed</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
      </section>

      {query.isLoading ? (
        <p className="mt-6 text-slate-500">Loading resources…</p>
      ) : query.isError ? (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-700">
          <p>{getApiError(query.error)}</p>
          <button onClick={() => query.refetch()} className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold">Try again</button>
        </div>
      ) : resources.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {resources.map((resource) => {
            const Icon = icons[resource.kind] || BookOpen;
            const done = resource.progress.status === "COMPLETED";
            return (
              <article key={resource.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Icon size={20} className={done ? "mt-0.5 text-emerald-600" : "mt-0.5 text-indigo-600"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{resource.kind.toLowerCase()}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-950">{resource.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{resource.topic?.name || resource.subject?.name || "General"}</p>
                  </div>
                  {done && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Done</span>}
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <a href={resource.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:underline">
                    Open resource <ExternalLink size={14} />
                  </a>
                  {!done && (
                    <button
                      onClick={() => progress.mutate(resource.id)}
                      disabled={progress.isPending}
                      className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {progress.isPending && progress.variables === resource.id ? "Saving…" : "Mark complete"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BookOpen size={32} className="mx-auto text-slate-400" />
          <h2 className="mt-3 font-bold text-slate-900">No matching resources</h2>
          <p className="mt-1 text-sm text-slate-500">Try another search or choose a different filter.</p>
        </div>
      )}
      {progress.isError && <p role="alert" className="mt-4 text-sm text-red-700">{getApiError(progress.error)}</p>}
    </main>
  );
}
