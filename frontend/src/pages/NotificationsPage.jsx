import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function NotificationsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get("/me/notifications")).data.data });
  const readAll = useMutation({ mutationFn: () => api.post("/me/notifications/read-all"), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const read = useMutation({ mutationFn: (id) => api.post(`/me/notifications/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  if (query.isLoading) return <p>Loading notifications…</p>;
  if (query.isError) return <p className="rounded-xl bg-red-50 p-5 text-red-700">{getApiError(query.error)} <button onClick={() => query.refetch()} className="font-bold underline">Retry</button></p>;
  return <div className="max-w-3xl"><div className="flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Notification center</p><h1 className="mt-2 text-3xl font-bold">Notifications</h1></div><button onClick={() => readAll.mutate()} className="text-sm font-bold text-indigo-600">Mark all read</button></div><p className="mt-2 text-sm text-slate-500">{query.data.unread} unread</p><div className="mt-6 space-y-3">{query.data.items.length ? query.data.items.map((item) => <button key={item.id} onClick={() => !item.readAt && read.mutate(item.id)} className={`w-full rounded-2xl p-5 text-left shadow-sm ${item.readAt ? "bg-white" : "border border-indigo-200 bg-indigo-50"}`}><div className="flex justify-between gap-4"><strong>{item.title}</strong><span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></div><p className="mt-2 text-sm text-slate-600">{item.body}</p></button>) : <p className="rounded-xl border border-dashed p-6 text-slate-500">No notifications.</p>}</div></div>;
}
