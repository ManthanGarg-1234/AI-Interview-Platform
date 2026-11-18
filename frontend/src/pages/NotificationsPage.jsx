import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", page],
    queryFn: async () => (await api.get("/me/notifications", { params: { page, limit: 20 } })).data.data,
  });
  const invalidate = () => client.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => api.post("/me/notifications/read-all"), onSuccess: invalidate });
  const read = useMutation({ mutationFn: (id) => api.post(`/me/notifications/${id}/read`), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id) => api.delete(`/me/notifications/${id}`), onSuccess: invalidate });
  if (query.isLoading) return <p role="status">Loading notifications…</p>;
  if (query.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  const actionError = readAll.error || read.error || remove.error;
  return <div className="mx-auto max-w-4xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Notification center</p><h1 className="mt-2 text-3xl font-bold">Notifications</h1><p className="mt-2 text-sm text-slate-500">{query.data.unread} unread</p></div>
      <div className="flex gap-3"><Link to="/notification-preferences" className="self-center text-sm font-bold text-indigo-700">Preferences</Link><button disabled={!query.data.unread || readAll.isPending} onClick={() => readAll.mutate()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Mark all read</button></div>
    </header>
    {actionError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(actionError)}</p>}
    <div className="mt-6 space-y-3">
      {query.data.items.length ? query.data.items.map((item) => <article key={item.id} className={`rounded-2xl p-5 shadow-sm ${item.readAt ? "bg-white" : "border border-indigo-200 bg-indigo-50"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{item.type.replaceAll("_", " ")}</p><h2 className="mt-1 font-bold text-slate-950">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.body}</p></div>
          <time className="shrink-0 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</time>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          {!item.readAt && <button disabled={read.isPending} onClick={() => read.mutate(item.id)} className="font-semibold text-indigo-700 disabled:opacity-50">Mark read</button>}
          <button disabled={remove.isPending} onClick={() => remove.mutate(item.id)} className="font-semibold text-slate-500 disabled:opacity-50">Delete</button>
        </div>
      </article>) : <p className="rounded-xl border border-dashed p-6 text-slate-500">No notifications on this page.</p>}
    </div>
    {query.data.pages > 1 && <div className="mt-5 flex items-center justify-end gap-3">
      <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
      <span className="text-sm text-slate-500">Page {query.data.page} of {query.data.pages}</span>
      <button disabled={page === query.data.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button>
    </div>}
  </div>;
}
