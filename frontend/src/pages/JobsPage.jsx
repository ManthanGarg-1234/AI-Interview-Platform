import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, BriefcaseBusiness, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const employmentTypes = [
  ["", "All job types"],
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["INTERNSHIP", "Internship"],
];

function salaryLabel(job) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const amount = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value));
  if (job.salaryMin != null && job.salaryMax != null) return `${amount(job.salaryMin)} – ${amount(job.salaryMax)}`;
  return job.salaryMin != null ? `From ${amount(job.salaryMin)}` : `Up to ${amount(job.salaryMax)}`;
}

export default function JobsPage() {
  const client = useQueryClient();
  const [filters, setFilters] = useState({ q: "", location: "", employmentType: "", page: 1 });
  const q = useDeferredValue(filters.q.trim());
  const location = useDeferredValue(filters.location.trim());
  const jobs = useQuery({
    queryKey: ["jobs", q, location, filters.employmentType, filters.page],
    queryFn: async () => (await api.get(`/jobs?${new URLSearchParams({
      q,
      location,
      employmentType: filters.employmentType,
      page: String(filters.page),
      limit: "12",
    })}`)).data.data,
  });
  const bookmark = useMutation({
    mutationFn: ({ id, bookmarked }) => bookmarked ? api.delete(`/jobs/${id}/bookmark`) : api.post(`/jobs/${id}/bookmark`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  return (
    <main className="max-w-6xl">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Career opportunities</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Find your next opportunity</h1>
        <p className="mt-2 text-slate-600">Search current roles, compare requirements, and save jobs to follow up later.</p>
      </header>

      <section className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Role or company
          <input value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="e.g. frontend developer" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Location
          <input value={filters.location} onChange={(event) => setFilter("location", event.target.value)} placeholder="City or remote" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Employment
          <select value={filters.employmentType} onChange={(event) => setFilter("employmentType", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            {employmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      {jobs.isLoading ? (
        <p className="mt-6 text-slate-500">Finding matching opportunities…</p>
      ) : jobs.isError ? (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-700">
          <p>{getApiError(jobs.error)}</p>
          <button onClick={() => jobs.refetch()} className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold">Try again</button>
        </div>
      ) : (
        <>
          <p className="mt-5 text-sm text-slate-500">{jobs.data.total} role{jobs.data.total === 1 ? "" : "s"} found</p>
          {jobs.data.items.length ? (
            <div className="mt-3 grid gap-4">
              {jobs.data.items.map((job) => (
                <article key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link className="text-xl font-bold text-slate-950 hover:text-indigo-700" to={`/student/jobs/${job.id}`}>{job.title}</Link>
                      <p className="mt-1 font-medium text-slate-700">{job.company.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => bookmark.mutate({ id: job.id, bookmarked: job.bookmarked })}
                      disabled={bookmark.isPending}
                      aria-label={job.bookmarked ? "Remove saved job" : "Save job"}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {job.bookmarked ? <BookmarkCheck size={16} className="text-indigo-600" /> : <Bookmark size={16} />}
                      {job.bookmarked ? "Saved" : "Save job"}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                    <span><MapPin size={14} className="mr-1 inline" />{job.location || "Flexible location"}</span>
                    <span><BriefcaseBusiness size={14} className="mr-1 inline" />{job.employmentType.replaceAll("_", " ").toLowerCase()}</span>
                    {salaryLabel(job) && <span>{salaryLabel(job)}</span>}
                    {job.deadline && <span>Apply by {new Date(job.deadline).toLocaleDateString()}</span>}
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{job.description}</p>
                  {job.skills?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.skills.slice(0, 6).map(({ skill }) => <span key={skill.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{skill.name}</span>)}
                    </div>
                  )}
                  <Link to={`/student/jobs/${job.id}`} className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">View opportunity</Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <h2 className="font-bold text-slate-900">No roles match these filters</h2>
              <p className="mt-1 text-sm text-slate-500">Try a broader title or location.</p>
            </div>
          )}
          {jobs.data.pages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <button disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-40">Previous</button>
              <span className="text-sm text-slate-500">Page {jobs.data.page} of {jobs.data.pages}</span>
              <button disabled={filters.page >= jobs.data.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
      {bookmark.isError && <p role="alert" className="mt-4 text-sm text-red-700">{getApiError(bookmark.error)}</p>}
    </main>
  );
}
