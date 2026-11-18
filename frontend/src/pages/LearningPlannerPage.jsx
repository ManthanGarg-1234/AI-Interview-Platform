import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, ListTodo } from "lucide-react";
import { api, getApiError } from "../lib/api";

const initialForm = { targetRole: "", dailyMinutes: 60, deadline: "", goals: "" };

function planProgress(plan) {
  const total = plan.tasks.length;
  const done = plan.tasks.filter((task) => task.status === "COMPLETED").length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

export default function LearningPlannerPage() {
  const client = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const goals = form.goals.split(/[\n,]/).map((goal) => goal.trim()).filter(Boolean);
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/me/plans")).data.data,
  });
  const create = useMutation({
    mutationFn: () => api.post("/me/plans", {
      targetRole: form.targetRole.trim(),
      dailyMinutes: Number(form.dailyMinutes),
      deadline: form.deadline || null,
      goals,
    }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["plans"] });
      setForm(initialForm);
    },
  });
  const complete = useMutation({
    mutationFn: ({ planId, taskId }) => api.post(`/me/plans/${planId}/tasks/${taskId}/complete`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["plans"] }),
  });

  return (
    <main className="max-w-5xl">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Your preparation roadmap</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Study planner</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Turn a target role into clear daily practice goals. Your plans stay saved so you can track progress over time.</p>
      </header>

      <form className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <h2 className="text-lg font-bold text-slate-950">Create a study plan</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Target role
            <input required minLength={2} maxLength={200} value={form.targetRole} onChange={(event) => setForm({ ...form, targetRole: event.target.value })} placeholder="e.g. Backend developer" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Study time per day (minutes)
            <input required type="number" min="15" max="720" value={form.dailyMinutes} onChange={(event) => setForm({ ...form, dailyMinutes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Target date (optional)
            <input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:row-span-2">
            Goals (one per line or comma-separated)
            <textarea required value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} placeholder={"Review data structures\nPractice SQL queries\nComplete a mock interview"} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" />
            <span className="mt-1 block text-xs font-normal text-slate-500">{goals.length} goal{goals.length === 1 ? "" : "s"} · Each goal creates a trackable task.</span>
          </label>
        </div>
        <button type="submit" disabled={create.isPending || !form.targetRole.trim() || !goals.length} className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          {create.isPending ? "Creating plan…" : "Create plan"}
        </button>
        {create.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(create.error)}</p>}
      </form>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-950">Your plans</h2>
          <span className="text-sm text-slate-500">{plans.data?.length || 0} saved</span>
        </div>
        {plans.isLoading ? (
          <p className="mt-4 text-slate-500">Loading your plans…</p>
        ) : plans.isError ? (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{getApiError(plans.error)} <button onClick={() => plans.refetch()} className="ml-2 font-bold underline">Retry</button></div>
        ) : plans.data.length ? (
          <div className="mt-4 space-y-4">
            {plans.data.map((plan) => {
              const progress = planProgress(plan);
              return (
                <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950">{plan.targetRole || "Study plan"}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span><Clock3 size={14} className="mr-1 inline" />{plan.dailyMinutes || 0} minutes/day</span>
                        {plan.deadline && <span><CalendarDays size={14} className="mr-1 inline" />Target {new Date(plan.deadline).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {plan.status === "COMPLETED" && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Plan complete</span>}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-semibold text-slate-500"><span>{progress.done} of {progress.total} tasks complete</span><span>{progress.percent}%</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} /></div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {plan.tasks.length ? plan.tasks.map((task) => (
                      <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                        <div className="flex items-start gap-2">
                          {task.status === "COMPLETED" ? <CheckCircle2 size={17} className="mt-0.5 text-emerald-600" /> : <ListTodo size={17} className="mt-0.5 text-indigo-500" />}
                          <div>
                            <p className={`font-medium ${task.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</p>
                            {task.dueAt && <p className="mt-0.5 text-xs text-slate-500">Due {new Date(task.dueAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        {task.status !== "COMPLETED" && (
                          <button
                            onClick={() => complete.mutate({ planId: plan.id, taskId: task.id })}
                            disabled={complete.isPending}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {complete.isPending && complete.variables?.taskId === task.id ? "Saving…" : "Complete"}
                          </button>
                        )}
                      </div>
                    )) : <p className="text-sm text-slate-500">No tasks in this plan.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <ListTodo size={28} className="mx-auto text-slate-400" />
            <p className="mt-3 font-bold text-slate-900">No study plans yet</p>
            <p className="mt-1 text-sm text-slate-500">Add your target role and a few goals to build your first roadmap.</p>
          </div>
        )}
        {complete.isError && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(complete.error)}</p>}
      </section>
    </main>
  );
}
