import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function JobsPage() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const jobs = useQuery({
    queryKey: ["jobs", search, location, page],
    queryFn: async () => (await api.get("/jobs", { params: { q: search.trim() || undefined, location: location.trim() || undefined, page, limit: 10 } })).data.data,
  });
  const bookmarks = useQuery({ queryKey: ["job-bookmarks"], queryFn: async () => (await api.get("/jobs/me/bookmarks")).data.data });
  const applications = useQuery({ queryKey: ["job-applications"], queryFn: async () => (await api.get("/jobs/me/applications")).data.data });
  const bookmark = useMutation({
    mutationFn: ({ id, saved }) => saved ? api.delete(`/jobs/${id}/bookmark`) : api.post(`/jobs/${id}/bookmark`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["job-bookmarks"] }),
  });

  if (jobs.isLoading) return <p role="status">Loading opportunities…</p>;
  if (jobs.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(jobs.error)}</p><button onClick={() => jobs.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  const savedIds = new Set((bookmarks.data || []).map((item) => item.jobId));
  const applicationByJob = new Map((applications.data || []).map((item) => [item.jobId, item]));
  return <div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Career opportunities</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Find your next opportunity</h1><p className="mt-2 text-slate-600">Search active roles, save opportunities, and track your applications.</p></div>
      <Link to="/student/dashboard" className="text-sm font-bold text-indigo-700">Back to dashboard</Link>
    </header>
    <section aria-label="Job search filters" className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
      <label className="sr-only" htmlFor="job-search">Search roles</label>
      <input id="job-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Role or keyword" className="rounded-xl border border-slate-300 px-4 py-3" />
      <label className="sr-only" htmlFor="job-location">Filter by location</label>
      <input id="job-location" value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }} placeholder="Location" className="rounded-xl border border-slate-300 px-4 py-3" />
      <p className="self-center text-sm text-slate-500">{jobs.data.total} active role(s)</p>
    </section>
    {bookmark.isError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(bookmark.error)}</p>}
    {jobs.data.items.length ? <div className="mt-5 grid gap-4">
      {jobs.data.items.map((job) => {
        const saved = savedIds.has(job.id);
        const application = applicationByJob.get(job.id);
        return <article key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950"><Link className="hover:text-indigo-600" to={`/student/jobs/${job.id}`}>{job.title}</Link></h2>
              <p className="mt-1 text-slate-500">{job.company.name} · {job.location || "Flexible"}</p>
              <p className="mt-1 text-sm text-slate-500">{job.employmentType?.replaceAll("_", " ") || "Employment type not specified"}{job.publishedAt ? ` · Posted ${new Date(job.publishedAt).toLocaleDateString()}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {application && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Applied · {application.status.replaceAll("_", " ").toLowerCase()}</span>}
              <button aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={bookmark.isPending} onClick={() => bookmark.mutate({ id: job.id, saved })}>{saved ? "Saved" : "Save job"}</button>
            </div>
          </div>
          <p className="mt-4 line-clamp-3 text-slate-600">{job.description}</p>
          {job.skills?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{job.skills.slice(0, 8).map(({ skill }) => <span key={skill.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{skill.name}</span>)}</div>}
          <Link to={`/student/jobs/${job.id}`} className="mt-4 inline-block text-sm font-bold text-indigo-700">View role details</Link>
        </article>;
      })}
    </div> : <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">No active opportunities match these filters.</p>}
    {jobs.data.pages > 1 && <div className="mt-5 flex items-center justify-end gap-3">
      <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
      <span className="text-sm text-slate-500">Page {jobs.data.page} of {jobs.data.pages}</span>
      <button disabled={page === jobs.data.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button>
    </div>}
    {(bookmarks.isError || applications.isError) && <p className="mt-4 text-sm text-amber-800">Saved-job or application status could not be loaded. <button onClick={() => { bookmarks.refetch(); applications.refetch(); }} className="font-bold underline">Retry</button></p>}
  </div>;
}
