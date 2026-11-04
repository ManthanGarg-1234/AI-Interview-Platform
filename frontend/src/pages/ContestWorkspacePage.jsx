import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

export default function ContestWorkspacePage() {
  const { id } = useParams();
  const workspace = useQuery({ queryKey: ["contest-workspace", id], queryFn: async () => (await api.get(`/contests/${id}/workspace`)).data.data });
  if (workspace.isLoading) return <p className="text-slate-500">Loading contest workspace…</p>;
  if (workspace.isError) return <div className="rounded-2xl bg-red-50 p-5 text-red-700">Register for this contest to access its workspace.</div>;
  return <section><p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Contest workspace</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{workspace.data.contest.title}</h1><p className="mt-2 text-slate-600">Submissions are evaluated by the contest rules and do not affect practice progress.</p><div className="mt-8 space-y-4">{workspace.data.problems.map((item) => <article className="rounded-2xl border border-slate-200 bg-white p-5" key={item.id}><div className="flex justify-between"><h2 className="font-bold">{item.sequence}. {item.problem.title}</h2><span className="text-sm font-semibold text-indigo-600">{item.points} points</span></div><p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.problem.statement}</p><p className="mt-3 text-xs text-slate-500">Languages: {item.problem.languageConfigs.map((language) => language.language).join(", ")}</p></article>)}</div></section>;
}
