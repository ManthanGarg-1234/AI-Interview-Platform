import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";
export default function RecruiterJobsPage() {
  const query = useQuery({ queryKey: ["recruiter-jobs"], queryFn: async () => (await api.get("/recruiter/jobs")).data.data });
  if (query.isLoading) return <p>Loading jobs…</p>; if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;
  return <div className="max-w-6xl"><h1 className="text-3xl font-bold">Jobs</h1><p className="mt-2 text-slate-600">Manage roles across your company memberships.</p><div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="divide-y">{query.data.map((job) => <div className="flex items-center justify-between p-5" key={job.id}><div><p className="font-bold">{job.title}</p><p className="text-sm text-slate-500">{job.company.name} · {job.status}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{job._count?.applications || 0} applications</span></div>)}</div></div></div>;
}
