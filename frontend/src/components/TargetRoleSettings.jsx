import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function TargetRoleSettings() {
  const queryClient = useQueryClient();
  const [roleSlug, setRoleSlug] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const roles = useQuery({
    queryKey: ["target-roles"],
    queryFn: async () => (await api.get("/target-roles")).data.data,
  });
  const selected = useQuery({
    queryKey: ["student-target-roles"],
    queryFn: async () => (await api.get("/target-roles/mine")).data.data,
  });
  const save = useMutation({
    mutationFn: (body) => api.post("/target-roles/mine", body),
    onSuccess: () => {
      setRoleSlug("");
      setGoalDate("");
      queryClient.invalidateQueries({ queryKey: ["student-target-roles"] });
    },
  });
  const changePrimary = useMutation({
    mutationFn: ({ slug, changes }) => api.patch(`/target-roles/mine/${slug}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["student-target-roles"] }),
  });
  const remove = useMutation({
    mutationFn: (slug) => api.delete(`/target-roles/mine/${slug}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["student-target-roles"] }),
  });
  const error = roles.error || selected.error || save.error || changePrimary.error || remove.error;
  const selectedSlugs = new Set((selected.data || []).map((item) => item.role.slug));

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-slate-950">Target roles</h2>
        <p className="mt-1 text-sm text-slate-600">Choose roles to focus your placement preparation. Self-reported goals are not proficiency evidence.</p>
      </div>

      {roles.isLoading || selected.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading target roles…</p>
      ) : (
        <>
          {selected.data?.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {selected.data.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.role.name}
                      {item.isPrimary && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">Primary</span>}
                    </p>
                    <label className="mt-2 block text-xs font-medium text-slate-500">
                      Goal date
                      <input
                        type="date"
                        value={item.goalDate ? new Date(item.goalDate).toISOString().slice(0, 10) : ""}
                        onChange={(event) => changePrimary.mutate({ slug: item.role.slug, changes: { goalDate: event.target.value || null } })}
                        className="ml-2 rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                    {item.role.description && <p className="mt-1 text-sm text-slate-600">{item.role.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {!item.isPrimary && <button type="button" onClick={() => changePrimary.mutate({ slug: item.role.slug, changes: { isPrimary: true } })} disabled={changePrimary.isPending} className="text-sm font-semibold text-indigo-700 disabled:opacity-50">Make primary</button>}
                    <button type="button" onClick={() => remove.mutate(item.role.slug)} disabled={remove.isPending} className="text-sm font-semibold text-red-600 disabled:opacity-50">Remove</button>
                  </div>
                  <TargetRoleReadiness slug={item.role.slug} />
                </li>
              ))}
            </ul>
          )}

          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
            event.preventDefault();
            if (roleSlug) save.mutate({ roleSlug, ...(goalDate ? { goalDate } : {}) });
          }}>
            <label className="min-w-52 flex-1 text-sm font-semibold text-slate-700">
              Add a target role
              <select value={roleSlug} onChange={(event) => setRoleSlug(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <option value="">Select a role</option>
                {roles.data?.filter((role) => !selectedSlugs.has(role.slug)).map((role) => <option key={role.id} value={role.slug}>{role.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Goal date (optional)
              <input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2" />
            </label>
            <button type="submit" disabled={!roleSlug || save.isPending} className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Add role"}
            </button>
          </form>
          {selected.data?.length === 0 && <p className="mt-3 text-sm text-slate-500">No target roles selected yet.</p>}
        </>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{getApiError(error)}</p>}
      {roles.isError && <button type="button" onClick={() => roles.refetch()} className="mt-2 text-sm font-semibold text-indigo-700">Retry loading roles</button>}
    </section>
  );
}

function TargetRoleReadiness({ slug }) {
  const [open, setOpen] = useState(false);
  const readiness = useQuery({
    queryKey: ["target-role-readiness", slug],
    queryFn: async () => (await api.get(`/target-roles/mine/${slug}/readiness`)).data.data,
    enabled: open,
  });
  const statusLabel = {
    EVIDENCE_AVAILABLE: "Measured evidence",
    SELF_REPORTED_ONLY: "Self-reported",
    PROFILE_EVIDENCE_ONLY: "Profile evidence (unverified)",
    MISSING_EVIDENCE: "Evidence missing",
    MEASURED: "Assessment measured",
    NO_ASSESSMENT_EVIDENCE: "No assessment evidence",
  };

  return (
    <div className="basis-full">
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-sm font-semibold text-indigo-700">
        {open ? "Hide readiness report" : "View readiness report"}
      </button>
      {open && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4">
          {readiness.isLoading ? <p className="text-sm text-slate-500">Building your evidence report…</p> : null}
          {readiness.isError && (
            <p role="alert" className="text-sm text-red-700">
              {getApiError(readiness.error)}{" "}
              <button type="button" onClick={() => readiness.refetch()} className="font-semibold underline">Retry</button>
            </p>
          )}
          {readiness.data && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold text-slate-900">Evidence-backed preparation coverage</h3>
                <span className="text-sm font-bold text-indigo-700">
                  {readiness.data.coverage.percent == null ? "Not enough requirements to score" : `${readiness.data.coverage.percent}% (${readiness.data.coverage.measured}/${readiness.data.coverage.total})`}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{readiness.data.coverage.definition}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <section>
                  <h4 className="font-semibold text-slate-800">Required skills</h4>
                  {readiness.data.requiredSkills.length ? (
                    <ul className="mt-2 space-y-2">
                      {readiness.data.requiredSkills.map((skill) => (
                        <li key={skill.name} className="rounded-lg bg-white p-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-medium text-slate-800">{skill.name}</span>
                            <span className="text-xs text-slate-500">{statusLabel[skill.status] || skill.status}</span>
                          </div>
                          {skill.evidence.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-600">{skill.evidence.map((entry, index) => <li key={`${entry.type}-${index}`}>{entry.label}{entry.accuracy != null ? ` · ${entry.accuracy}% across ${entry.questions} questions` : ""}{entry.count != null ? ` · ${entry.count} solved` : ""}</li>)}</ul>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">This role has no required skills configured.</p>}
                </section>
                <section>
                  <h4 className="font-semibold text-slate-800">Core subjects</h4>
                  {readiness.data.coreSubjects.length ? (
                    <ul className="mt-2 space-y-2">
                      {readiness.data.coreSubjects.map((subject) => (
                        <li key={subject.name} className="flex justify-between gap-2 rounded-lg bg-white p-3 text-sm">
                          <span>{subject.name}</span>
                          <span className="text-right text-xs text-slate-500">{subject.accuracy == null ? statusLabel[subject.status] : `${subject.accuracy}% assessment accuracy · ${subject.questions} questions`}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">This role has no core subjects configured.</p>}
                  <p className="mt-3 text-sm text-slate-700">DSA: {readiness.data.dsa.solvedProblems} solved problems across {readiness.data.dsa.byTopic.length} tagged topics. {readiness.data.dsa.status === "REQUIREMENTS_NOT_CONFIGURED" ? "Role-specific DSA targets are not configured, so no DSA readiness score is inferred." : "Role-specific targets are configured; this report does not yet score them."}</p>
                  <p className="mt-1 text-sm text-slate-700">Projects recorded in profile: {readiness.data.projects.profileEntries} (profile evidence only).</p>
                </section>
              </div>
              <ul className="mt-4 space-y-1 text-xs text-slate-500">{readiness.data.evidenceLimits.map((note) => <li key={note}>{note}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
