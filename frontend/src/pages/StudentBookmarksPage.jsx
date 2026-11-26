import { useQuery } from "@tanstack/react-query";
import { Bookmark, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function StudentBookmarksPage() {
  const query = useQuery({ queryKey: ["student-preparation-bookmarks"], queryFn: async () => (await api.get("/coding/library/bookmarks", { params: { pageSize: 50 } })).data.data });
  if (query.isError) return <section className="max-w-4xl rounded-2xl bg-red-50 p-6 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-bold">Retry</button></section>;
  const items = query.data?.items || [];
  return <main className="max-w-6xl">
    <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Preparation resources</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Bookmarked problems</h1>
    <p className="mt-2 text-slate-600">Your saved practice links stay connected to their original learning platforms.</p>
    {query.isLoading ? <div className="mt-7 grid gap-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-200" />)}</div> : items.length ? <div className="mt-7 grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{item.platform} · {item.difficulty}</p><h2 className="mt-1 font-bold text-slate-900">{item.title}</h2><p className="mt-2 text-sm text-slate-600">{item.summary || "Open the original problem to practice."}</p></div><Bookmark size={18} className="shrink-0 text-indigo-600" /></div><a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Open external problem <ExternalLink size={14} /></a></article>)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Bookmark className="mx-auto text-slate-400" size={32} /><h2 className="mt-3 font-bold text-slate-800">No saved resources yet</h2><p className="mt-1 text-sm text-slate-500">Bookmark a practice problem to add it here.</p><Link to="/student/coding" className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Browse external practice links</Link></div>}
  </main>;
}
