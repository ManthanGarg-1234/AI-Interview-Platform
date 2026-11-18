import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const stages = ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_INTERVIEW", "HR_INTERVIEW", "SELECTED", "OFFER_RELEASED", "HIRED", "REJECTED"];

export default function RecruiterApplicationsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ["recruiter-applications", search],
    queryFn: async () => (await api.get("/recruiter/applications", { params: { q: search || undefined } })).data.data,
  });
  const detail = useQuery({
    queryKey: ["recruiter-application", selected?.id],
    queryFn: async () => (await api.get(`/recruiter/applications/${selected.id}`)).data.data,
    enabled: Boolean(selected),
  });
  const status = useMutation({
    mutationFn: ({ id, nextStatus }) => api.patch(`/recruiter/applications/${id}/status`, { status: nextStatus }),
    onMutate: async ({ id, nextStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["recruiter-applications"] });
      const previous = queryClient.getQueriesData({ queryKey: ["recruiter-applications"] });
      queryClient.setQueriesData({ queryKey: ["recruiter-applications"] }, (old) => Array.isArray(old)
        ? old.map((application) => application.id === id ? { ...application, status: nextStatus } : application)
        : old);
      return { previous };
    },
    onError: (error, _variables, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruiter-applications"] });
      queryClient.invalidateQueries({ queryKey: ["recruiter-dashboard"] });
      detail.refetch();
    },
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/recruiter/applications/${selected.id}/notes`, { body: note, private: true }),
    onSuccess: () => { setNote(""); detail.refetch(); },
  });
  const saveTags = useMutation({
    mutationFn: () => api.put(`/recruiter/applications/${selected.id}/tags`, { tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) }),
    onSuccess: () => detail.refetch(),
  });
  const grouped = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, (applications.data || []).filter((item) => item.status === stage)])), [applications.data]);

  function openApplication(application) {
    setSelected(application);
    setTags(Array.isArray(application.internalTags) ? application.internalTags.join(", ") : "");
  }
  function moveWithFallback(application, nextStatus) {
    if (nextStatus !== application.status) status.mutate({ id: application.id, nextStatus });
  }
  function moveByKeyboard(event, application) {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = stages.indexOf(application.status);
    const nextIndex = Math.max(0, Math.min(stages.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    moveWithFallback(application, stages[nextIndex]);
  }

  return (
    <div className="max-w-[1600px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Applicant tracking</p><h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">Applications</h1></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate or role" className="w-full max-w-sm rounded-xl border border-slate-300 px-4 py-3 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
      </header>
      {applications.isError && <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300"><p>{getApiError(applications.error)}</p><button type="button" onClick={() => applications.refetch()} className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-bold text-white">Retry</button></div>}
      {applications.isLoading ? <p role="status" className="mt-8 text-slate-500 dark:text-slate-400">Loading applications…</p> : !applications.isError && (applications.data || []).length === 0 ? <div className="mt-7 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400"><p>No candidates yet.</p><Link to="/recruiter/jobs" className="mt-3 inline-block font-bold text-indigo-700">Post a job</Link></div> : (
        <div className="mt-7 grid gap-4 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}>
          {stages.map((stage) => (
            <section key={stage} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application-id"); const application = (applications.data || []).find((item) => item.id === id); if (application) moveWithFallback(application, stage); }} className="min-h-96 rounded-2xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between px-1"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">{stage.replaceAll("_", " ")}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">{grouped[stage].length}</span></div>
              <div className="mt-3 space-y-3">
                {grouped[stage].map((application) => (
                  <div key={application.id} draggable onDragStart={(event) => event.dataTransfer.setData("application-id", application.id)} onKeyDown={(event) => moveByKeyboard(event, application)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800" tabIndex={0} role="group" aria-label={`${application.student?.fullName || application.student?.email} application`}>
                    <button type="button" onClick={() => openApplication(application)} className="w-full text-left">
                    <p className="font-bold text-slate-900">{application.student?.fullName || application.student?.email}</p>
                    <p className="mt-1 text-sm text-slate-600">{application.job?.title}</p>
                    <p className="mt-3 text-xs text-slate-400">Applied {new Date(application.appliedAt).toLocaleDateString()}</p>
                    </button>
                    <label className="mt-3 block md:hidden text-xs font-bold text-slate-600 dark:text-slate-300">Move stage<select aria-label={`Move ${application.student?.fullName || application.student?.email} stage`} value={application.status} onChange={(event) => moveWithFallback(application, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">{stages.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Candidate application</p><h2 className="mt-2 text-2xl font-bold">{selected.student?.fullName || selected.student?.email}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-3 py-2">Close</button></div>
            {detail.isLoading ? <p className="mt-6">Loading candidate details…</p> : detail.isError ? <p className="mt-6 text-red-600">{getApiError(detail.error)}</p> : (
              <div className="mt-6 space-y-5">
                <section className="rounded-xl border border-slate-200 p-4"><p className="text-sm text-slate-500">Role</p><p className="mt-1 font-bold">{detail.data.job.title}</p><p className="mt-2 text-sm text-slate-600">{detail.data.student.email}</p></section>
                <section><p className="text-sm font-bold">Move to stage</p><select value={detail.data.status} onChange={(event) => status.mutate({ id: selected.id, nextStatus: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3">{stages.map((stage) => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select>{status.isError && <p className="mt-2 text-sm text-red-600">{getApiError(status.error)}</p>}</section>
                <section><p className="text-sm font-bold">Internal tags</p><div className="mt-2 flex gap-2"><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="technical, referral" className="flex-1 rounded-xl border border-slate-300 px-4 py-3" /><button type="button" onClick={() => saveTags.mutate()} className="rounded-xl border px-4 py-3 font-bold">Save</button></div></section>
                <section><p className="text-sm font-bold">Recruiter note</p><textarea value={note} onChange={(event) => setNote(event.target.value)} rows="3" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" /><button type="button" disabled={!note.trim()} onClick={() => addNote.mutate()} className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-40">Add private note</button></section>
                <section><p className="text-sm font-bold">Recent notes</p><div className="mt-2 space-y-2">{detail.data.notes?.length ? detail.data.notes.map((item) => <p key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">{item.body}</p>) : <p className="text-sm text-slate-500">No notes yet.</p>}</div></section>
                <section><p className="text-sm font-bold">Candidate profile</p><p className="mt-2 text-sm text-slate-600">{detail.data.student.studentProfile?.headline || "No headline provided"}</p>{detail.data.student.studentProfile?.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{detail.data.student.studentProfile.skills.map(({ skill }) => <span key={skill.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{skill.name}</span>)}</div>}</section>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
