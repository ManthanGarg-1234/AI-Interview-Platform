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
