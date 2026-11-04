import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function InterviewerWorkspacePage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["interviewer-workspace", id], queryFn: async () => (await api.get(`/interviews/${id}/workspace`)).data.data });
  if (query.isLoading) return <p className="text-slate-500">Loading interviewer workspace…</p>;
  if (query.isError) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{getApiError(query.error)}</p>;
  return <section><p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Interviewer workspace</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{query.data.interview.title}</h1><p className="mt-2 text-slate-600">Capture evidence-based feedback. AI practice interviews never change application decisions.</p><div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Scorecards</h2><p className="mt-2 text-sm text-slate-500">{query.data.scorecards.length} scorecard(s) submitted.</p></div></section>;
}
