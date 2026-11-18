import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  requiredSkills: "",
  coreSubjects: "",
  languages: "",
  dsaRequirements: "{}",
  status: "PUBLISHED",
};

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toForm(role) {
  return {
    name: role.name,
    slug: role.slug,
    description: role.description || "",
    requiredSkills: (role.requiredSkills || []).join(", "),
    coreSubjects: (role.coreSubjects || []).join(", "),
    languages: (role.languages || []).join(", "),
    dsaRequirements: JSON.stringify(role.dsaRequirements || {}, null, 2),
    status: role.status,
  };
}

export default function AdminTargetRolesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const query = useQuery({
    queryKey: ["admin-target-roles"],
    queryFn: async () => (await api.get("/admin/target-roles")).data.data,
  });
  const save = useMutation({
    mutationFn: async () => {
      let dsaRequirements;
      try {
        dsaRequirements = JSON.parse(form.dsaRequirements || "{}");
      } catch {
        throw new Error("DSA requirements must be valid JSON.");
      }
      const body = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        requiredSkills: splitList(form.requiredSkills),
        coreSubjects: splitList(form.coreSubjects),
        languages: splitList(form.languages),
        dsaRequirements,
        status: form.status,
      };
      return editingId
        ? api.patch(`/admin/target-roles/${editingId}`, body)
        : api.post("/admin/target-roles", body);
    },
    onSuccess: () => {
      setEditingId(null);
      setForm(emptyForm);
      setFormError("");
      queryClient.invalidateQueries({ queryKey: ["admin-target-roles"] });
    },
    onError: async (error) => setFormError(await getApiError(error)),
  });

  function edit(role) {
    setEditingId(role.id);
    setForm(toForm(role));
    setFormError("");
  }

  return (
    <section className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Platform governance</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Target roles</h1>
      <p className="mt-2 text-slate-600">Manage published role definitions and preparation requirements. These definitions are not student proficiency scores.</p>

      <form className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        setFormError("");
        save.mutate();
      }}>
        <Field label="Role name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Field label="URL slug" value={form.slug} onChange={(value) => setForm({ ...form, slug: value })} required />
        <Field label="Required skills (comma separated)" value={form.requiredSkills} onChange={(value) => setForm({ ...form, requiredSkills: value })} />
        <Field label="Core subjects (comma separated)" value={form.coreSubjects} onChange={(value) => setForm({ ...form, coreSubjects: value })} />
        <Field label="Languages (comma separated)" value={form.languages} onChange={(value) => setForm({ ...form, languages: value })} />
        <label className="text-sm font-semibold text-slate-700">Publication status
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Description
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">DSA requirements (JSON)
          <textarea value={form.dsaRequirements} onChange={(event) => setForm({ ...form, dsaRequirements: event.target.value })} rows={3} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" />
        </label>
        {formError && <p role="alert" className="text-sm text-red-700 md:col-span-2">{formError}</p>}
        <div className="flex gap-3 md:col-span-2">
          <button type="submit" disabled={save.isPending} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">{save.isPending ? "Saving…" : editingId ? "Save changes" : "Create role"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); setFormError(""); }} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700">Cancel</button>}
        </div>
      </form>

      {query.isLoading ? <p className="mt-6 text-slate-500">Loading role catalog…</p> : query.isError ? (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700"><p>{getApiError(query.error)}</p><button type="button" onClick={() => query.refetch()} className="mt-2 font-semibold underline">Retry</button></div>
      ) : query.data.length === 0 ? <p className="mt-6 rounded-xl bg-white p-5 text-slate-600">No target roles have been configured.</p> : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {query.data.map((role) => (
            <li key={role.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div>
                <h2 className="font-bold text-slate-900">{role.name}</h2>
                <p className="text-sm text-slate-500">{role.slug} · {role.status.toLowerCase()}</p>
                {role.description && <p className="mt-2 text-sm text-slate-600">{role.description}</p>}
              </div>
              <button type="button" onClick={() => edit(role)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Edit</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, value, onChange, required = false }) {
  return <label className="text-sm font-semibold text-slate-700">{label}
    <input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5" />
  </label>;
}
