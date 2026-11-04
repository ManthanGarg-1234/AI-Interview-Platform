import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function RecruiterAssessmentReviewsPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["recruiter-assessment-reviews", id], queryFn: async () => (await api.get(`/recruiter/assessments/${id}/reviews`)).data.data });
  if (query.isLoading) return <p>Loading reviews…</p>;
  if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;
  return <div className="max-w-6xl"><h1 className="text-3xl font-bold">Assessment review</h1><div className="mt-8 divide-y overflow-hidden rounded-2xl bg-white shadow-sm">{query.data.map((item) => <div className="p-5" key={item.assignmentId}><p className="font-bold">{item.student.studentProfile?.firstName || "Candidate"} {item.student.studentProfile?.lastName || ""}</p><p className="text-sm text-slate-500">{item.status} · {item.attempt ? `${item.attempt.status} · score ${item.attempt.score ?? "pending"}` : "Not attempted"}</p>{item.attempt?.review?.note && <p className="mt-2 text-sm">{item.attempt.review.note}</p>}</div>)}</div></div>;
}
