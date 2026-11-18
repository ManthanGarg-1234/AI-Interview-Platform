import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Code2, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const filters = ["ALL", "UPCOMING", "LIVE", "ENDED"];
const phaseStyles = {
  UPCOMING: "bg-sky-50 text-sky-700",
  LIVE: "bg-emerald-50 text-emerald-700",
  ENDED: "bg-slate-100 text-slate-600",
};

export default function ContestsPage() {
  const client = useQueryClient();
  const [phase, setPhase] = useState("ALL");
  const contests = useQuery({
    queryKey: ["contests"],
    queryFn: async () => (await api.get("/contests")).data.data,
  });
  const register = useMutation({
    mutationFn: (id) => api.post(`/contests/${id}/register`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["contests"] }),
  });
  const visibleContests = useMemo(
    () => (contests.data || []).filter((contest) => phase === "ALL" || contest.phase === phase),
    [contests.data, phase],
  );

  return (
    <main>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Competitive coding</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Coding contests</h1>
          <p className="mt-2 text-slate-600">Register early, check contest times, and open your workspace when you’re ready.</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-700">
          <Trophy size={22} />
          <p className="mt-2 text-sm font-bold">{contests.data?.filter((contest) => contest.registered).length || 0} joined</p>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Filter contests">
        {filters.map((item) => (
          <button key={item} type="button" onClick={() => setPhase(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${phase === item ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-indigo-50"}`}>
            {item === "ALL" ? "All contests" : item[0] + item.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {contests.isLoading ? (
        <p className="mt-6 text-slate-500">Loading contests…</p>
      ) : contests.isError ? (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-700">
          <p>{getApiError(contests.error)}</p>
          <button onClick={() => contests.refetch()} className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold">Try again</button>
        </div>
      ) : visibleContests.length ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {visibleContests.map((contest) => (
            <article key={contest.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-slate-950">{contest.title}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${phaseStyles[contest.phase]}`}>{contest.phase}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{contest.description || "A timed competitive coding event."}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                <span><Code2 size={15} className="mr-1 inline" />{contest.problemCount} problems</span>
                <span><CalendarClock size={15} className="mr-1 inline" />Starts {new Date(contest.startsAt).toLocaleString()}</span>
                <span>Ends {new Date(contest.endsAt).toLocaleString()}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {contest.registered ? (
                  <>
                    <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">Registered</span>
                    <Link to={`/student/contests/${contest.id}`} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Open workspace</Link>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => register.mutate(contest.id)}
                    disabled={register.isPending || contest.phase === "ENDED"}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {register.isPending && register.variables === contest.id ? "Registering…" : contest.phase === "ENDED" ? "Registration closed" : "Register"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-bold text-slate-900">No {phase === "ALL" ? "" : phase.toLowerCase() + " "}contests</h2>
          <p className="mt-1 text-sm text-slate-500">Check back later for new events.</p>
        </div>
      )}
      {register.isError && <p role="alert" className="mt-4 text-sm text-red-700">{getApiError(register.error)}</p>}
    </main>
  );
}
