import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function AdminSecurityPage() {
  const events = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: async () => (await api.get("/admin/security-events")).data.data,
  });

  if (events.isLoading) return <p className="text-slate-500">Loading security events…</p>;
  if (events.isError) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        <p>{getApiError(events.error)}</p>
        <button type="button" onClick={() => events.refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-2 font-bold">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-600">Platform governance</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Security events</h1>
      <p className="mt-2 text-slate-600">Review recent security activity and its current resolution status.</p>
      {events.data.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          No security events have been recorded.
        </p>
      ) : (
        <section className="mt-8 space-y-4">
          {events.data.map((event) => (
            <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">{event.type}</h2>
                  <p className="mt-1 text-sm text-slate-500">{event.source} · {new Date(event.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2 text-xs font-bold">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{event.severity}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{event.status}</span>
                </div>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-indigo-700">Event details</summary>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-4 text-xs text-slate-700">{JSON.stringify(event.details, null, 2)}</pre>
              </details>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
