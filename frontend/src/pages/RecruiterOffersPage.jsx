import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const emptyOffer = { applicationId: "", designation: "", compensation: { currency: "INR", baseSalary: "", variable: "", bonus: "" }, joiningDate: "", expiresAt: "" };

export default function RecruiterOffersPage() {
  const [form, setForm] = useState(emptyOffer);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const offers = useQuery({ queryKey: ["recruiter-offers"], queryFn: async () => (await api.get("/recruiter/offers")).data.data });
  const applications = useQuery({ queryKey: ["recruiter-offer-applications"], queryFn: async () => (await api.get("/recruiter/applications", { params: { status: "SELECTED" } })).data.data });
  const companies = useQuery({ queryKey: ["recruiter-companies"], queryFn: async () => (await api.get("/recruiter/companies")).data.data });
  const create = useMutation({
    mutationFn: () => api.post("/recruiter/offers", { ...form, compensation: { ...form.compensation, baseSalary: Number(form.compensation.baseSalary), variable: Number(form.compensation.variable || 0), bonus: Number(form.compensation.bonus || 0) } }),
    onSuccess: () => { setForm(emptyOffer); setMessage("Offer draft created."); queryClient.invalidateQueries({ queryKey: ["recruiter-offers"] }); queryClient.invalidateQueries({ queryKey: ["recruiter-applications"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });
  const action = useMutation({
    mutationFn: ({ id, nextAction }) => api.post(`/recruiter/offers/${id}/${nextAction}`),
    onSuccess: () => { setMessage("Offer status updated."); offers.refetch(); queryClient.invalidateQueries({ queryKey: ["recruiter-applications"] }); queryClient.invalidateQueries({ queryKey: ["recruiter-dashboard"] }); },
    onError: (error) => setMessage(getApiError(error)),
  });

  if (!companies.data?.length) return <EmptyState title="Create your company first" text="Offers are linked to your company's jobs." />;
  return (
    <div className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Hiring</p><h1 className="mt-2 text-3xl font-bold">Offers</h1>
      {message && <p role="status" className="mt-5 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</p>}
      <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Create offer</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Candidate application
            <select required value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="">Select an applicant</option>
              {applications.data?.map((item) => <option key={item.id} value={item.id}>{item.student?.fullName || item.student?.email} — {item.job?.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Designation<input required value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="text-sm font-semibold">Base salary<input required type="number" min="0" value={form.compensation.baseSalary} onChange={(event) => setForm({ ...form, compensation: { ...form.compensation, baseSalary: event.target.value } })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="text-sm font-semibold">Currency<input value={form.compensation.currency} onChange={(event) => setForm({ ...form, compensation: { ...form.compensation, currency: event.target.value } })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="text-sm font-semibold">Joining date<input required type="date" value={form.joiningDate} onChange={(event) => setForm({ ...form, joiningDate: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
          <label className="text-sm font-semibold">Offer expiry<input required type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /></label>
        </div>
        <button title={!applications.data?.length ? "Offers become available after an applicant is selected" : undefined} disabled={create.isPending || !applications.data?.length} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{create.isPending ? "Creating…" : "Create offer"}</button>
      </form>
      <section className="mt-7 divide-y overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {offers.data?.length ? offers.data.map((offer) => (
          <article key={offer.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="font-bold">{offer.application?.student?.fullName || offer.application?.student?.email}</p><p className="mt-1 text-sm text-slate-600">{offer.designation} · {offer.job.title}</p><p className="mt-1 text-xs text-slate-500">{offer.status} · expires {new Date(offer.expiresAt).toLocaleDateString()}</p></div>
            <div className="flex gap-2">
              {offer.status === "DRAFT" && <button type="button" onClick={() => action.mutate({ id: offer.id, nextAction: "send" })} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white">Send offer</button>}
              {["DRAFT", "SENT"].includes(offer.status) && <button type="button" onClick={() => action.mutate({ id: offer.id, nextAction: "withdraw" })} className="rounded-lg border px-3 py-2 text-sm font-bold text-red-600">Withdraw</button>}
              {offer.status === "SENT" && <button type="button" onClick={() => action.mutate({ id: offer.id, nextAction: "hire" })} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">Mark hired</button>}
            </div>
          </article>
        )) : <p className="p-6 text-slate-500">No offers have been created.</p>}
      </section>
    </div>
  );
}

function EmptyState({ title, text }) { return <div className="max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-slate-500">{text}</p><Link to="/recruiter/company" className="mt-5 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Create company</Link></div>; }
