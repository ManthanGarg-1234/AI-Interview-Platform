import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function RecruiterAssessmentsPage() {
  const query = useQuery({ queryKey: ["recruiter-assessments"], queryFn: async () => (await api.get("/recruiter/assessments")).data.data });
  if (query.isLoading) return <p>Loading assessments…</p>;
  if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;
  return <div className="max-w-6xl"><h1 className="text-3xl font-bold">Recruiter assessments</h1><p className="mt-2 text-slate-600">Create fair, deterministic assessments and review assigned applicants.</p>
    <div className="mt-8 divide-y overflow-hidden rounded-2xl bg-white shadow-sm">{query.data.map((assessment) => <div className="flex items-center justify-between p-5" key={assessment.id}><div><p className="font-bold">{assessment.title}</p><p className="text-sm text-slate-500">{assessment.status} · {assessment.questionCount} questions · {assessment.codingProblemCount} coding problems</p></div><Link className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" to={`/recruiter/assessments/${assessment.id}/reviews`}>Review</Link></div>)}</div>
  </div>;
}
