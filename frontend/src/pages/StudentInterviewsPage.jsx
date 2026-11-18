import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

function canJoin(interview, now = Date.now()) {
  if (!interview.scheduledStart || !interview.scheduledEnd || !["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(interview.status)) return false;
  const start = new Date(interview.scheduledStart).getTime() - 15 * 60 * 1000;
  return now >= start && now <= new Date(interview.scheduledEnd).getTime();
}

function localDateTime(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function StudentInterviewsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [reschedule, setReschedule] = useState({});
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["student-recruiter-interviews"],
    queryFn: async () => (await api.get("/interviews")).data.data,
  });
  const action = useMutation({
    mutationFn: ({ id, action: nextAction, body }) => api.post(`/interviews/${id}/${nextAction}`, body),
    onSuccess: (_response, variables) => {
      setMessage(variables.action === "request-reschedule" ? "Reschedule request sent." : "Interview invitation updated.");
      setReschedule((value) => ({ ...value, [variables.id]: "" }));
      client.invalidateQueries({ queryKey: ["student-recruiter-interviews"] });
      client.invalidateQueries({ queryKey: ["student-dashboard"] });
    },
    onError: (error) => setMessage(getApiError(error)),
  });

  if (query.isLoading) return <p role="status" className="text-slate-500">Loading interview invitations…</p>;
  if (query.isError) return <section className="rounded-2xl bg-red-50 p-5 text-red-700"><p>{getApiError(query.error)}</p><button onClick={() => query.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  const interviews = query.data || [];
  return <section className="mx-auto max-w-5xl">
    <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Interview schedule</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Recruiter interviews</h1>
    <p className="mt-2 text-slate-600">Review invitations, confirm attendance, request a different time, or join an eligible interview.</p>
    {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${message.includes("sent") || message.includes("updated") ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message}</p>}
    <div className="mt-7 space-y-4">
      {interviews.length ? interviews.map((item) => {
        const participant = item.participants?.find((person) => person.userId === user?.id);
        const interviewerNames = item.participants?.filter((person) => person.role === "INTERVIEWER").map((person) => person.user?.fullName).filter(Boolean);
        const pendingReschedule = item.rescheduleRequests?.some((request) => request.status === "PENDING" && request.requestedById === user?.id);
        const joinable = canJoin(item);
        const active = ["SCHEDULED", "CONFIRMED"].includes(item.status);
        return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.application?.job?.title || "Interview"} · {item.company?.name || item.application?.job?.company?.name || "Company"}</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">{item.status.replaceAll("_", " ")}</span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Date and time</dt><dd className="mt-1 font-medium">{item.scheduledStart ? new Date(item.scheduledStart).toLocaleString(undefined, { timeZone: item.timezone }) : "Time pending"} ({item.timezone})</dd></div>
            <div><dt className="text-slate-500">Duration</dt><dd className="mt-1 font-medium">{item.scheduledStart && item.scheduledEnd ? `${Math.round((new Date(item.scheduledEnd) - new Date(item.scheduledStart)) / 60000)} minutes` : "Not set"}</dd></div>
            <div><dt className="text-slate-500">Interviewers</dt><dd className="mt-1 font-medium">{interviewerNames?.length ? interviewerNames.join(", ") : "Not assigned"}</dd></div>
            <div><dt className="text-slate-500">Round(s)</dt><dd className="mt-1 font-medium">{item.rounds?.map((round) => round.name).join(", ") || "Interview"}</dd></div>
          </dl>
          {item.cancellationReason && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{item.cancellationReason}</p>}
          {active && <div className="mt-5 flex flex-wrap items-center gap-2">
            {!participant?.confirmedAt && <button onClick={() => action.mutate({ id: item.id, action: "confirm" })} disabled={action.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Accept invitation</button>}
            <button onClick={() => action.mutate({ id: item.id, action: "decline", body: { reason: "Candidate declined the invitation." } })} disabled={action.isPending} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">Decline</button>
            {!pendingReschedule && <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`reschedule-${item.id}`}>Proposed interview start</label>
              <input id={`reschedule-${item.id}`} type="datetime-local" value={reschedule[item.id] || ""} min={localDateTime(Date.now())} onChange={(event) => setReschedule((value) => ({ ...value, [item.id]: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button onClick={() => {
                if (!reschedule[item.id]) return;
                const start = new Date(reschedule[item.id]);
                const duration = item.scheduledStart && item.scheduledEnd ? new Date(item.scheduledEnd) - new Date(item.scheduledStart) : 60 * 60 * 1000;
                action.mutate({ id: item.id, action: "request-reschedule", body: {
                  startsAt: start.toISOString(),
                  endsAt: new Date(start.getTime() + duration).toISOString(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                } });
              }} disabled={!reschedule[item.id] || action.isPending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Request reschedule</button>
            </div>}
            {pendingReschedule && <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Reschedule request pending</span>}
            {joinable && <Link to={`/interviews/${item.id}/room`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Join interview</Link>}
          </div>}
        </article>;
      }) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">No recruiter interviews or invitations yet.</p>}
    </div>
  </section>;
}
