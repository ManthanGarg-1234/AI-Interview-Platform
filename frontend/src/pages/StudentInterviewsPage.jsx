import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function StudentInterviewsPage() {
  const query = useQuery({ queryKey: ["student-recruiter-interviews"], queryFn: async () => (await api.get("/interviews")).data.data });
  return <section><p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Interview schedule</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Upcoming interviews</h1><p className="mt-2 text-slate-600">Confirm your attendance or request a different time.</p>{query.isError && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{getApiError(query.error)}</p>}<div className="mt-8 grid gap-4">{(query.data || []).map((item) => <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={item.id}><div className="flex items-start justify-between"><h2 className="font-bold text-slate-900">{item.title}</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{item.status}</span></div><p className="mt-2 text-sm text-slate-600">{item.scheduledStart ? new Date(item.scheduledStart).toLocaleString([], { timeZone: item.timezone }) : "Time pending"} ({item.timezone})</p><p className="mt-3 text-xs text-slate-500">All times are shown with the organizer's timezone.</p></article>)}</div></section>;
}
