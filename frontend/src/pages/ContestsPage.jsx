import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ContestsPage() {
  const client = useQueryClient();
  const contests = useQuery({ queryKey: ["contests"], queryFn: async () => (await api.get("/contests")).data.data });
  const register = useMutation({ mutationFn: (id) => api.post(`/contests/${id}/register`), onSuccess: () => client.invalidateQueries({ queryKey: ["contests"] }) });
  return <section><p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Competitive coding</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Contests</h1><div className="mt-8 grid gap-4 md:grid-cols-2">{(contests.data || []).map((contest) => <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" key={contest.id}><div className="flex items-start justify-between"><h2 className="text-xl font-bold">{contest.title}</h2><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{contest.phase}</span></div><p className="mt-2 text-sm text-slate-600">{contest.description || "Timed coding competition."}</p><p className="mt-4 text-xs text-slate-500">{contest.problemCount} problems · {new Date(contest.startsAt).toLocaleString()} – {new Date(contest.endsAt).toLocaleString()}</p><div className="mt-5 flex gap-3"><button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => register.mutate(contest.id)} disabled={register.isPending || contest.phase === "ENDED"}>Register</button><Link className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold" to={`/student/contests/${contest.id}`}>Open workspace</Link></div></article>)}{contests.isLoading && <p className="text-slate-500">Loading contests…</p>}{contests.isError && <p className="text-red-600">Unable to load contests.</p>}</div></section>;
}
