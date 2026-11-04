import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, BriefcaseBusiness, MapPin } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

function salaryLabel(job) {
  const format = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value));
  if (job.salaryMin != null && job.salaryMax != null) return `${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  if (job.salaryMin != null) return `From ${format(job.salaryMin)}`;
  if (job.salaryMax != null) return `Up to ${format(job.salaryMax)}`;
  return "Not specified";
}

export default function JobDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [consent, setConsent] = useState(false);
  const query = useQuery({ queryKey: ["job", id], queryFn: async () => (await api.get(`/jobs/${id}`)).data.data });
  const apply = useMutation({
    mutationFn: () => api.post(`/jobs/${id}/apply`, { consent: true }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["job", id] });
      client.invalidateQueries({ queryKey: ["student-dashboard"] });
    },
  });
  const bookmark = useMutation({
    mutationFn: (saved) => saved ? api.delete(`/jobs/${id}/bookmark`) : api.post(`/jobs/${id}/bookmark`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["job", id] });
      client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  if (query.isLoading) return <p className="text-slate-500">Loading opportunity…</p>;
  if (query.isError) return <div role="alert" className="rounded-2xl bg-red-50 p-5 text-red-700">{getApiError(query.error)}</div>;
  const job = query.data;

  return (
    <main className="max-w-4xl">
      <Link to="/student/jobs" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline"><ArrowLeft size={14} /> All opportunities</Link>
      <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-600">{job.company.name}</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">{job.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span><MapPin size={14} className="mr-1 inline" />{job.location || "Flexible location"}</span>
              <span><BriefcaseBusiness size={14} className="mr-1 inline" />{job.employmentType.replaceAll("_", " ").toLowerCase()}</span>
            </p>
          </div>
          <button type="button" onClick={() => bookmark.mutate(job.bookmarked)} disabled={bookmark.isPending} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-indigo-50 disabled:opacity-50">
            {job.bookmarked ? <BookmarkCheck size={16} className="text-indigo-600" /> : <Bookmark size={16} />}
            {job.bookmarked ? "Saved" : "Save job"}
          </button>
        </div>

        <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <div><dt className="text-xs font-bold uppercase text-slate-500">Compensation</dt><dd className="mt-1 font-semibold text-slate-900">{salaryLabel(job)}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-slate-500">Application deadline</dt><dd className="mt-1 font-semibold text-slate-900">{job.deadline ? new Date(job.deadline).toLocaleDateString() : "Not specified"}</dd></div>
          {job.educationRequirement && <div><dt className="text-xs font-bold uppercase text-slate-500">Education</dt><dd className="mt-1 text-slate-700">{job.educationRequirement}</dd></div>}
          {job.experienceRequirement && <div><dt className="text-xs font-bold uppercase text-slate-500">Experience</dt><dd className="mt-1 text-slate-700">{job.experienceRequirement}</dd></div>}
        </dl>

        {job.skills?.length > 0 && (
          <section className="mt-6">
            <h2 className="font-bold text-slate-900">Skills for this role</h2>
            <div className="mt-2 flex flex-wrap gap-2">{job.skills.map(({ id: skillId, skill, required }) => <span key={skillId} className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800">{skill.name}{required ? "" : " · preferred"}</span>)}</div>
          </section>
        )}
        <section className="mt-6">
          <h2 className="font-bold text-slate-900">About the role</h2>
          <div className="prose mt-2 max-w-none whitespace-pre-wrap text-slate-700">{job.description}</div>
        </section>

        {job.company.website && <a href={job.company.website} target="_blank" rel="noreferrer" className="mt-5 inline-block text-sm font-semibold text-indigo-700 hover:underline">Visit company website</a>}
        <div className="mt-7 border-t border-slate-100 pt-5">
          {apply.isSuccess ? (
            <p role="status" className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">Your application was submitted. You can track its status from your dashboard.</p>
          ) : (
            <>
              <label className="flex items-start gap-3 text-sm text-slate-600">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
                <span>I consent to share my candidate profile with this company for recruitment purposes.</span>
              </label>
              <button type="button" disabled={!consent || apply.isPending} onClick={() => apply.mutate()} className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                {apply.isPending ? "Submitting…" : "Submit application"}
              </button>
            </>
          )}
          {apply.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(apply.error)}</p>}
          {bookmark.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(bookmark.error)}</p>}
        </div>
      </article>
    </main>
  );
}
