import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function InterviewResultsPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["interview", id], queryFn: async () => (await api.get(`/me/interviews/${id}`)).data.data });
  if (query.isLoading) return <p>Loading evaluation…</p>;
  if (query.isError) return <p className="rounded-xl bg-red-50 p-5 text-red-700">{getApiError(query.error)}</p>;
  const item = query.data;
  const hasLocalEvaluation = item.evaluations?.some((evaluation) => evaluation.modelAlias === "local-interviewer-v1");
  return <div className="max-w-5xl">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Evaluation report</p><h1 className="mt-2 text-3xl font-bold">{item.configuration.targetRole}</h1><p className="mt-2 text-slate-500">{item.configuration.type} · {item.status}</p></div>
      <Link to="/student/interviews/history" className="font-bold text-indigo-600">Back to history</Link>
    </div>
    {hasLocalEvaluation && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Development heuristic evaluation — this is not AI-generated feedback. Configure an AI provider for model-based evaluation.</p>}
    {!item.evaluations?.length && <p className="mt-6 rounded-xl bg-slate-50 p-5 text-slate-600">No evaluation was saved for this interview.</p>}
    <div className="mt-8 space-y-5">{item.evaluations?.map((evaluation, index) => <section key={evaluation.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex justify-between"><h2 className="font-bold">Question {index + 1} evaluation</h2><strong className="text-indigo-700">{evaluation.overallScore == null ? "—" : `${Number(evaluation.overallScore).toFixed(0)}/100`}</strong></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(evaluation.categoryScores || {}).map(([key, value]) => <div key={key} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{key}</span><strong>{value}</strong></div>)}</div>
      <p className="mt-4 text-sm text-slate-600">{evaluation.evidence?.feedback || "Evaluation feedback is unavailable."}</p>
    </section>)}</div>
  </div>;
}
