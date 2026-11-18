import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const emptyJob = { companyId: "", title: "", description: "", location: "", employmentType: "FULL_TIME", salaryMin: "", salaryMax: "", educationRequirement: "", experienceRequirement: "", deadline: "", skillIds: [], metadata: { department: "", category: "", workMode: "ONSITE", vacancies: 1, responsibilities: [], requirements: [], benefits: [], preferredSkills: [] } };

export default function RecruiterJobsPage() {
  const [form, setForm] = useState(emptyJob);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["recruiter-jobs"], queryFn: async () => (await api.get("/recruiter/jobs")).data.data });
  const companies = useQuery({ queryKey: ["recruiter-companies"], queryFn: async () => (await api.get("/recruiter/companies")).data.data });
  const create = useMutation({
    mutationFn: () => api.post("/recruiter/jobs", { ...form, skillIds: form.skillIds.filter(Boolean), salaryMin: form.salaryMin === "" ? null : Number(form.salaryMin), salaryMax: form.salaryMax === "" ? null : Number(form.salaryMax) }),
    onSuccess: () => { setOpen(false); setForm(emptyJob); setMessage("Job draft created."); queryClient.invalidateQueries({ queryKey: ["recruiter-jobs"] }); queryClient.invalidateQueries({ queryKey: ["recruiter-dashboard"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });
  const action = useMutation({
    mutationFn: ({ id, nextAction }) => api.post(`/recruiter/jobs/${id}/${nextAction}`),
    onSuccess: () => { setMessage("Job status updated."); queryClient.invalidateQueries({ queryKey: ["recruiter-jobs"] }); queryClient.invalidateQueries({ queryKey: ["recruiter-dashboard"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });
  const duplicate = useMutation({
    mutationFn: (id) => api.post(`/recruiter/jobs/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recruiter-jobs"] }),
  });
  const edit = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/recruiter/jobs/${id}`, data),
    onSuccess: () => { setEditing(null); setMessage("Job updated."); queryClient.invalidateQueries({ queryKey: ["recruiter-jobs"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });
  function startEdit(job) {
    setEditing(job);
    setForm({
      companyId: job.companyId,
      title: job.title || "",
      description: job.description || "",
      location: job.location || "",
      employmentType: job.employmentType || "FULL_TIME",
      salaryMin: job.salaryMin ?? "",
      salaryMax: job.salaryMax ?? "",
      educationRequirement: job.educationRequirement || "",
      experienceRequirement: job.experienceRequirement || "",
      deadline: job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : "",
      skillIds: (job.skills || []).map((item) => item.skillId),
      metadata: { ...emptyJob.metadata, ...(job.metadata || {}) },
    });
  }
  function confirmAction(job, nextAction) {
    if (window.confirm(`Are you sure you want to ${nextAction} this job?`)) action.mutate({ id: job.id, nextAction });
  }
  if (query.isLoading) return <p role="status" className="text-slate-600 dark:text-slate-300">Loading jobs…</p>;
  if (query.isError) return <div className="rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300"><p>{getApiError(query.error)}</p><button type="button" onClick={() => query.refetch()} className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-bold text-white">Retry</button></div>;
  if (!companies.data?.length) return <div className="max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h1 className="text-2xl font-bold">Create your company first</h1><p className="mt-2 text-slate-500">Jobs belong to a company, so create one before posting a role.</p><Link to="/recruiter/company" className="mt-5 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Create company</Link></div>;
  return (
    <div className="max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Recruitment</p><h1 className="mt-2 text-3xl font-bold">Jobs</h1><p className="mt-2 text-slate-600">Create, publish, and manage roles across your companies.</p></div><button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Create job</button></header>
      {message && <p role="status" className="mt-5 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
      <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {query.data.length ? <div className="divide-y">{query.data.map((job) => (
          <article className="flex flex-wrap items-center justify-between gap-4 p-5" key={job.id}>
            <div><p className="font-bold">{job.title}</p><p className="mt-1 text-sm text-slate-500">{job.company.name} · {job.status.replaceAll("_", " ")}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{job._count?.applications || 0} applications</span><button type="button" onClick={() => startEdit(job)} className="rounded-lg border px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={() => { if (window.confirm("Duplicate this job?")) duplicate.mutate(job.id); }} className="rounded-lg border px-3 py-2 text-xs font-bold">Duplicate</button>{job.status === "DRAFT" && <button type="button" onClick={() => confirmAction(job, "publish")} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Publish</button>}{job.status === "PUBLISHED" && <button type="button" onClick={() => confirmAction(job, "pause")} className="rounded-lg border px-3 py-2 text-xs font-bold">Pause</button>}{["PUBLISHED", "PAUSED"].includes(job.status) && <button type="button" onClick={() => confirmAction(job, "close")} className="rounded-lg border px-3 py-2 text-xs font-bold text-red-600">Close</button>}{job.status === "CLOSED" && <button type="button" onClick={() => confirmAction(job, "archive")} className="rounded-lg border px-3 py-2 text-xs font-bold">Archive</button>}</div>
          </article>
        ))}</div> : <p className="p-6 text-slate-500">No candidates yet. <Link to="/recruiter/jobs" className="font-bold text-indigo-700">Post a job</Link></p>}
      </div>
      {open && <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-2xl font-bold">Create job</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2">Close</button></div><div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Company<select required value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="">Select company</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Job title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Department<input value={form.metadata.department} onChange={(event) => setForm({ ...form, metadata: { ...form.metadata, department: event.target.value } })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Employment type<select value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3">{["FULL_TIME","PART_TIME","CONTRACT","INTERNSHIP"].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="text-sm font-semibold">Work mode<select value={form.metadata.workMode} onChange={(event) => setForm({ ...form, metadata: { ...form.metadata, workMode: event.target.value } })} className="mt-2 w-full rounded-xl border px-4 py-3">{["REMOTE","HYBRID","ONSITE"].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
        <label className="text-sm font-semibold">Minimum salary<input type="number" value={form.salaryMin} onChange={(event) => setForm({ ...form, salaryMin: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Maximum salary<input type="number" value={form.salaryMax} onChange={(event) => setForm({ ...form, salaryMax: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Vacancies<input type="number" min="1" value={form.metadata.vacancies} onChange={(event) => setForm({ ...form, metadata: { ...form.metadata, vacancies: Number(event.target.value) } })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold">Application deadline<input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold md:col-span-2">Job description<textarea required rows="6" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold md:col-span-2">Education requirement<textarea rows="3" value={form.educationRequirement} onChange={(event) => setForm({ ...form, educationRequirement: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
        <label className="text-sm font-semibold md:col-span-2">Experience requirement<textarea rows="3" value={form.experienceRequirement} onChange={(event) => setForm({ ...form, experienceRequirement: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label>
      </div><button disabled={create.isPending} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{create.isPending ? "Creating…" : "Create draft"}</button>{create.isError && <p className="mt-3 text-sm text-red-600">{getApiError(create.error)}</p>}</form></div>}
      {editing && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form onSubmit={(event) => { event.preventDefault(); edit.mutate({ id: editing.id, data: { title: form.title, description: form.description, location: form.location || null, employmentType: form.employmentType, salaryMin: form.salaryMin === "" ? null : Number(form.salaryMin), salaryMax: form.salaryMax === "" ? null : Number(form.salaryMax), educationRequirement: form.educationRequirement || null, experienceRequirement: form.experienceRequirement || null, deadline: form.deadline ? new Date(form.deadline).toISOString() : null, metadata: form.metadata } }); }} className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"><div className="flex justify-between"><h2 className="text-2xl font-bold dark:text-white">Edit job</h2><button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 dark:border-slate-700">Close</button></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold dark:text-slate-200">Job title<input required aria-label="Job title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3 dark:border-slate-700 dark:bg-slate-950" /></label><label className="text-sm font-semibold dark:text-slate-200">Location<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3 dark:border-slate-700 dark:bg-slate-950" /></label><label className="text-sm font-semibold md:col-span-2 dark:text-slate-200">Job description<textarea required rows="6" aria-label="Job description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3 dark:border-slate-700 dark:bg-slate-950" /></label></div>{edit.isError && <p role="alert" className="mt-3 text-sm text-red-600">{getApiError(edit.error)}</p>}<button disabled={edit.isPending} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{edit.isPending ? "Saving…" : "Save changes"}</button></form></div>}
    </div>
  );
}
