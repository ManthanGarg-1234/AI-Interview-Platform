import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const taskStatuses = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
];

export default function LearningPlannerPage() {
  const client = useQueryClient();
  const [form, setForm] = useState({ targetRole: "", dailyMinutes: 60, goals: "", deadline: "" });
  const [taskDrafts, setTaskDrafts] = useState({});
  const plans = useQuery({ queryKey: ["plans"], queryFn: async () => (await api.get("/me/plans")).data.data });
  const invalidate = () => client.invalidateQueries({ queryKey: ["plans"] });
  const create = useMutation({
    mutationFn: () => api.post("/me/plans", {
      targetRole: form.targetRole.trim(),
      dailyMinutes: Number(form.dailyMinutes),
      deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
      goals: form.goals.split(",").map((goal) => goal.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      invalidate();
      setForm({ targetRole: "", dailyMinutes: 60, goals: "", deadline: "" });
    },
  });
  const createTask = useMutation({
    mutationFn: ({ planId, title, dueAt, priority }) => api.post(`/me/plans/${planId}/tasks`, {
      title,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      priority,
    }),
    onSuccess: (_response, variables) => {
      invalidate();
      setTaskDrafts((drafts) => ({ ...drafts, [variables.planId]: { title: "", dueAt: "", priority: "MEDIUM" } }));
    },
  });
  const updateTask = useMutation({
    mutationFn: ({ planId, taskId, status }) => api.patch(`/me/plans/${planId}/tasks/${taskId}`, { status }),
    onSuccess: invalidate,
  });
  const deleteTask = useMutation({
    mutationFn: ({ planId, taskId }) => api.delete(`/me/plans/${planId}/tasks/${taskId}`),
    onSuccess: invalidate,
  });

  if (plans.isLoading) return <p role="status">Loading your study plans…</p>;
  if (plans.isError) return <section className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(plans.error)}</p><button onClick={() => plans.refetch()} className="mt-2 font-bold underline">Retry</button></section>;

  return <div className="mx-auto max-w-6xl">
    <header><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Plan with purpose</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Personalized learning planner</h1><p className="mt-2 text-slate-600">Create plans and manage tasks without replacing your existing work.</p></header>
    <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }} className="mt-7 grid gap-3 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Target role<input required minLength="2" maxLength="200" value={form.targetRole} onChange={(event) => setForm({ ...form, targetRole: event.target.value })} placeholder="e.g. Backend Engineer" className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Daily study time (minutes)<input required type="number" min="15" max="720" value={form.dailyMinutes} onChange={(event) => setForm({ ...form, dailyMinutes: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Goals (comma-separated)<input value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} placeholder="System design, SQL, behavioral interviews" className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Target deadline (optional)<input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <button disabled={create.isPending || !form.targetRole.trim()} className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-50 md:col-span-2">{create.isPending ? "Creating plan…" : "Create plan"}</button>
      {create.isError && <p role="alert" className="text-sm text-red-600 md:col-span-2">{getApiError(create.error)}</p>}
    </form>

    {plans.data.length ? <div className="mt-7 space-y-5">
      {plans.data.map((plan) => {
        const draft = taskDrafts[plan.id] || { title: "", dueAt: "", priority: "MEDIUM" };
        const completed = plan.tasks.filter((task) => task.status === "COMPLETED").length;
        return <section key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold text-slate-950">{plan.targetRole || "Career preparation"}</h2><p className="mt-1 text-sm text-slate-500">{plan.dailyMinutes} minutes/day{plan.deadline ? ` · Goal date ${new Date(plan.deadline).toLocaleDateString()}` : ""}</p></div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-800">{completed}/{plan.tasks.length} tasks complete</span>
          </div>
          {plan.goals.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{plan.goals.map((goal) => <span key={goal.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{goal.title}</span>)}</div>}
          <form onSubmit={(event) => { event.preventDefault(); createTask.mutate({ planId: plan.id, ...draft, title: draft.title.trim() }); }} className="mt-5 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto_auto]">
            <label className="sr-only" htmlFor={`task-title-${plan.id}`}>New task title</label>
            <input id={`task-title-${plan.id}`} required minLength="2" maxLength="240" value={draft.title} onChange={(event) => setTaskDrafts((current) => ({ ...current, [plan.id]: { ...draft, title: event.target.value } }))} placeholder="Add a study task" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <label className="sr-only" htmlFor={`task-due-${plan.id}`}>Task due date</label>
            <input id={`task-due-${plan.id}`} type="datetime-local" value={draft.dueAt} onChange={(event) => setTaskDrafts((current) => ({ ...current, [plan.id]: { ...draft, dueAt: event.target.value } }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <label className="sr-only" htmlFor={`task-priority-${plan.id}`}>Task priority</label>
            <select id={`task-priority-${plan.id}`} value={draft.priority} onChange={(event) => setTaskDrafts((current) => ({ ...current, [plan.id]: { ...draft, priority: event.target.value } }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select>
            <button disabled={!draft.title.trim() || createTask.isPending} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Add task</button>
          </form>
          {(createTask.isError || updateTask.isError || deleteTask.isError) && <p role="alert" className="mt-3 text-sm text-red-600">{getApiError(createTask.error || updateTask.error || deleteTask.error)}</p>}
          {plan.tasks.length ? <ul className="mt-4 divide-y divide-slate-100">
            {plan.tasks.map((task) => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className={`font-medium ${task.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.priority.toLowerCase()} priority{task.dueAt ? ` · Due ${new Date(task.dueAt).toLocaleString()}` : ""}</p></div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`task-status-${task.id}`}>Status for {task.title}</label>
                <select id={`task-status-${task.id}`} value={task.status} disabled={updateTask.isPending} onChange={(event) => updateTask.mutate({ planId: plan.id, taskId: task.id, status: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm disabled:opacity-50">{taskStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
                <button aria-label={`Delete ${task.title}`} disabled={deleteTask.isPending} onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) deleteTask.mutate({ planId: plan.id, taskId: task.id }); }} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Delete</button>
              </div>
            </li>)}
          </ul> : <p className="mt-4 text-sm text-slate-500">No tasks yet. Add a task above to turn your goal into an actionable step.</p>}
        </section>;
      })}
    </div> : <p className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">No study plans yet. Create one to start tracking your preparation.</p>}
  </div>;
}
