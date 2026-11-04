import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api, getApiError } from "../lib/api";
export default function JobDetailPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const query = useQuery({ queryKey: ["job", id], queryFn: async () => (await api.get(`/jobs/${id}`)).data.data });
  const apply = useMutation({ mutationFn: () => api.post(`/jobs/${id}/apply`, { consent: true }), onSuccess: () => navigate("/student") });
  if (query.isLoading) return <p>Loading role…</p>; if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;
  const job = query.data;
  return <article className="max-w-3xl rounded-2xl bg-white p-8 shadow-sm"><p className="text-sm font-semibold text-indigo-600">{job.company.name}</p><h1 className="mt-2 text-3xl font-bold">{job.title}</h1><p className="mt-2 text-slate-500">{job.location || "Flexible"} · {job.employmentType.replaceAll("_", " ")}</p><div className="prose mt-8 max-w-none whitespace-pre-wrap text-slate-700">{job.description}</div><button disabled={apply.isPending} onClick={() => apply.mutate()} className="mt-8 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{apply.isPending ? "Applying…" : "Apply with consent"}</button>{apply.isError && <p className="mt-3 text-red-600">{getApiError(apply.error)}</p>}</article>;
}
