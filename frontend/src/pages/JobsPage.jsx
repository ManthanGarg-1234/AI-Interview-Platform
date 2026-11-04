import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";
export default function JobsPage() {
  const qc = useQueryClient(); const jobs = useQuery({ queryKey: ["jobs"], queryFn: async () => (await api.get("/jobs?limit=20")).data.data });
  const bookmark = useMutation({ mutationFn: (id) => api.post(`/jobs/${id}/bookmark`), onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }) });
  if (jobs.isLoading) return <p>Loading opportunities…</p>; if (jobs.isError) return <p className="text-red-600">{getApiError(jobs.error)}</p>;
  return <div className="max-w-5xl"><h1 className="text-3xl font-bold text-slate-950">Find your next opportunity</h1><p className="mt-2 text-slate-600">Search verified, active roles and track your applications.</p><div className="mt-8 grid gap-4">{jobs.data.items.map((job) => <article key={job.id} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold"><Link className="hover:text-indigo-600" to={`/student/jobs/${job.id}`}>{job.title}</Link></h2><p className="mt-1 text-slate-500">{job.company.name} · {job.location || "Flexible"}</p></div><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => bookmark.mutate(job.id)}>Save</button></div><p className="mt-4 line-clamp-2 text-slate-600">{job.description}</p></article>)}</div></div>;
}
