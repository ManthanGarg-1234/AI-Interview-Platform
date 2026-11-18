import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function RecruiterAssessmentsPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyId: "", title: "", type: "TECHNICAL", durationSeconds: 3600, negativeMarking: 0, maxAttempts: 1, questionIds: [], codingProblemIds: [] });
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["recruiter-assessments"], queryFn: async () => (await api.get("/recruiter/assessments")).data.data });
  const companies = useQuery({ queryKey: ["recruiter-companies"], queryFn: async () => (await api.get("/recruiter/companies")).data.data });
  const create = useMutation({
    mutationFn: () => api.post("/recruiter/assessments", form),
    onSuccess: () => { setOpen(false); setMessage("Assessment draft created."); queryClient.invalidateQueries({ queryKey: ["recruiter-assessments"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });
  const action = useMutation({
    mutationFn: ({ id, nextAction }) => api.post(`/recruiter/assessments/${id}/status/${nextAction}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recruiter-assessments"] }),
  });
  if (query.isLoading) return <p>Loading assessments…</p>;
  if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;
  if (!companies.data?.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h1 className="text-2xl font-bold">Create your company first</h1><p className="mt-2 text-slate-500">Assessments are owned by a company.</p><Link to="/recruiter/company" className="mt-5 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Create company</Link></div>;
  return <div className="max-w-6xl"><h1 className="text-3xl font-bold">Recruiter assessments</h1><p className="mt-2 text-slate-600">Create fair, deterministic assessments and review assigned applicants.</p>
    <div className="mt-6 flex justify-end"><button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Create assessment</button></div>
    {message && <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">{message}</p>}
    <div className="mt-5 divide-y overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{query.data.length ? query.data.map((assessment) => <div className="flex flex-wrap items-center justify-between gap-3 p-5" key={assessment.id}><div><p className="font-bold">{assessment.title}</p><p className="text-sm text-slate-500">{assessment.status} · {assessment.questionCount} questions · {assessment.codingProblemCount} coding problems</p></div><div className="flex gap-2">{assessment.status === "DRAFT" && <button type="button" onClick={() => action.mutate({ id: assessment.id, nextAction: "publish" })} className="rounded-lg border px-3 py-2 text-sm font-bold">Publish</button>}<Link className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" to={`/recruiter/assessments/${assessment.id}/reviews`}>Review</Link></div></div>) : <p className="p-6 text-slate-500">No recruiter assessments are available yet.</p>}</div>
    {open && <div className="fixed inset-0 z-40 bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-bold">Create assessment</h2><div className="mt-5 grid gap-4"><label className="text-sm font-semibold">Company<select required value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="">Select company</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-sm font-semibold">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label><label className="text-sm font-semibold">Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3">{["TECHNICAL","APTITUDE","CODING","SQL","SUBJECT","PRACTICE","RECRUITER"].map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-sm font-semibold">Duration (seconds)<input type="number" min="60" value={form.durationSeconds} onChange={(event) => setForm({ ...form, durationSeconds: Number(event.target.value) })} className="mt-2 w-full rounded-xl border px-4 py-3" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-3 font-bold">Cancel</button><button disabled={create.isPending} className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white">Create draft</button></div></form></div>}
  </div>;
}
