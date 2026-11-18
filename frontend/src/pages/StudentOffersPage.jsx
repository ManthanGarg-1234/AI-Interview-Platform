import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const tabs = ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"];

function expiryLabel(expiresAt) {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h left` : `${hours}h left`;
}

function OfferSummary({ offer, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(offer.id)} className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-bold text-slate-950 dark:text-white">{offer.job?.company?.name || "Company"}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{offer.designation} · {offer.job?.title}</p></div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{offer.status === "SENT" ? "PENDING" : offer.status}</span>
      </div>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{offer.compensation?.currency || ""} {Number(offer.compensation?.baseSalary || 0).toLocaleString()}</p>
      <p className={`mt-2 text-xs font-semibold ${offer.status === "SENT" && new Date(offer.expiresAt) > new Date() ? "text-amber-600" : "text-slate-500 dark:text-slate-400"}`}>{expiryLabel(offer.expiresAt)}</p>
    </button>
  );
}

export default function StudentOffersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("PENDING");
  const offers = useQuery({ queryKey: ["student-offers"], queryFn: async () => (await api.get("/me/offers")).data.data });
  const detail = useQuery({ queryKey: ["student-offer", id], queryFn: async () => (await api.get(`/me/offers/${id}`)).data.data, enabled: Boolean(id) });
  const respond = useMutation({
    mutationFn: ({ status, reason }) => api.post(`/me/offers/${id}/respond`, { status, ...(reason ? { reason } : {}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["student-offers"] }); queryClient.invalidateQueries({ queryKey: ["student-offer", id] }); },
  });
  const filtered = useMemo(() => (offers.data || []).filter((offer) => (tab === "PENDING" ? offer.status === "SENT" : offer.status === tab)), [offers.data, tab]);
  const alreadyAccepted = (offers.data || []).some((offer) => offer.status === "ACCEPTED");

  if (offers.isLoading) return <div role="status" className="text-slate-600 dark:text-slate-300">Loading your offers…</div>;
  if (offers.isError) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><p>We couldn’t load your offers.</p><button type="button" onClick={() => offers.refetch()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 font-bold text-white">Retry</button></div>;

  const selected = detail.data;
  const canRespond = selected?.status === "SENT" && new Date(selected.expiresAt) > new Date();
  function respondTo(status) {
    const action = status === "ACCEPTED" ? "accept" : "reject";
    if (!window.confirm(`Are you sure you want to ${action} this offer?`)) return;
    const reason = status === "REJECTED" ? window.prompt("Optional reason for rejecting this offer:") || "" : "";
    respond.mutate({ status, reason });
  }

  return (
    <div className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Career</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">Offers</h1>
      <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Offer status">
        {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === item ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{item[0] + item.slice(1).toLowerCase()}</button>)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          {filtered.length ? filtered.map((offer) => <OfferSummary key={offer.id} offer={offer} onSelect={(offerId) => navigate(`/student/offers/${offerId}`)} />) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">No {tab.toLowerCase()} offers.</div>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {!id && <p className="text-slate-500 dark:text-slate-400">Select an offer to view its details.</p>}
          {id && detail.isLoading && <p role="status" className="text-slate-500 dark:text-slate-400">Loading offer details…</p>}
          {id && detail.isError && <div className="text-red-700 dark:text-red-300"><p>{getApiError(detail.error)}</p><button type="button" onClick={() => detail.refetch()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">Retry</button></div>}
          {selected && <div><Link to="/student/offers" className="text-sm font-semibold text-indigo-600">← All offers</Link><h2 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">{selected.designation}</h2><p className="mt-1 text-slate-600 dark:text-slate-300">{selected.job?.company?.name} · {selected.job?.title}</p><dl className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200"><div className="flex justify-between gap-4"><dt>Compensation</dt><dd className="font-bold">{selected.compensation?.currency} {Number(selected.compensation?.baseSalary || 0).toLocaleString()}</dd></div><div className="flex justify-between gap-4"><dt>Joining date</dt><dd>{new Date(selected.joiningDate).toLocaleDateString()}</dd></div><div className="flex justify-between gap-4"><dt>Expires</dt><dd>{new Date(selected.expiresAt).toLocaleString()} ({expiryLabel(selected.expiresAt)})</dd></div><div className="flex justify-between gap-4"><dt>Status</dt><dd className="font-bold">{selected.status === "SENT" ? "PENDING" : selected.status}</dd></div></dl>{selected.responseReason && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Response: {selected.responseReason}</p>}{alreadyAccepted && <p role="alert" className="mt-5 text-sm text-amber-700 dark:text-amber-300">You have already accepted an offer</p>}{respond.isError && <p role="alert" className="mt-5 text-sm text-red-700 dark:text-red-300">{getApiError(respond.error)}</p>}{canRespond && <div className="mt-7 flex gap-3"><button type="button" disabled={respond.isPending || alreadyAccepted} onClick={() => respondTo("ACCEPTED")} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">Accept offer</button><button type="button" disabled={respond.isPending} onClick={() => respondTo("REJECTED")} className="rounded-xl border border-red-300 px-4 py-3 font-bold text-red-700 dark:border-red-800 dark:text-red-300 disabled:opacity-50">Reject offer</button></div>}</div>}
        </section>
      </div>
    </div>
  );
}
