import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { api, getApiError } from "../lib/api";

const emptySheet = { name: "", description: "", source: "", category: "DSA", estimatedMinutes: "", status: "DRAFT" };
const emptyProblem = { title: "", url: "", platform: "LEETCODE", difficulty: "MEDIUM", topic: "", subtopic: "", patterns: "", summary: "", attribution: "", placementPriority: "", estimatedMinutes: "", status: "DRAFT" };
const platformOptions = ["LEETCODE", "GFG", "CODE360", "HACKERRANK", "CODECHEF", "INTERVIEWBIT", "CODEFORCES", "OTHER"];

function Field({ label, children }) {
  return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function ErrorMessage({ error }) {
  return error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getApiError(error)}</p> : null;
}

export default function AdminCodingLibraryPage() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [sheetForm, setSheetForm] = useState(emptySheet);
  const [editingSheet, setEditingSheet] = useState(false);
  const [problemForm, setProblemForm] = useState(emptyProblem);
  const [editingProblem, setEditingProblem] = useState(null);
  const [companyTarget, setCompanyTarget] = useState("");
  const [companyForm, setCompanyForm] = useState({ companyName: "", evidenceUrl: "", verified: false });
  const [csv, setCsv] = useState("");
  const [csvName, setCsvName] = useState("");
  const [preview, setPreview] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const sheetsQuery = useQuery({
    queryKey: ["admin-coding-library", "sheets"],
    queryFn: async () => (await api.get("/admin/coding-library/sheets")).data.data,
  });
  const saveCompany = useMutation({
    mutationFn: () => api.post(`/admin/coding-library/problems/${companyTarget}/companies`, companyForm),
    onSuccess: () => {
      setCompanyTarget("");
      setCompanyForm({ companyName: "", evidenceUrl: "", verified: false });
      invalidateCatalogue();
    },
  });
  const statsQuery = useQuery({
    queryKey: ["admin-coding-library", "stats"],
    queryFn: async () => (await api.get("/admin/coding-library/stats")).data.data,
  });
  const detail = useQuery({
    queryKey: ["admin-coding-library", "sheet", selectedId],
    queryFn: async () => (await api.get(`/admin/coding-library/sheets/${selectedId}`)).data.data,
    enabled: Boolean(selectedId),
  });
  useEffect(() => {
    if (detail.data && !editingSheet) {
      const { name, description, source, category, estimatedMinutes, status } = detail.data;
      setSheetForm({ name, description, source, category, estimatedMinutes: estimatedMinutes ?? "", status });
    }
  }, [detail.data, editingSheet]);

  const invalidateCatalogue = () => {
    client.invalidateQueries({ queryKey: ["admin-coding-library"] });
    client.invalidateQueries({ queryKey: ["coding-library"] });
  };
  const saveSheet = useMutation({
    mutationFn: () => editingSheet
      ? api.patch(`/admin/coding-library/sheets/${selectedId}`, sheetPayload(sheetForm))
      : api.post("/admin/coding-library/sheets", sheetPayload(sheetForm)),
    onSuccess: ({ data }) => {
      setSelectedId(data.data.id);
      setEditingSheet(false);
      invalidateCatalogue();
    },
  });
  const addProblem = useMutation({
    mutationFn: () => api.post(`/admin/coding-library/sheets/${selectedId}/problems`, problemPayload(problemForm)),
    onSuccess: () => {
      setProblemForm(emptyProblem);
      invalidateCatalogue();
    },
  });
  const updateProblem = useMutation({
    mutationFn: () => api.patch(`/admin/coding-library/problems/${editingProblem.id}`, problemPayload(editingProblem, true)),
    onSuccess: () => {
      setEditingProblem(null);
      invalidateCatalogue();
    },
  });
  const verifyLink = useMutation({
    mutationFn: ({ id, verified }) => api.patch(`/admin/coding-library/problems/${id}/verification`, { verified }),
    onSuccess: invalidateCatalogue,
  });
  const removeAssociation = useMutation({
    mutationFn: (problemId) => api.delete(`/admin/coding-library/sheets/${selectedId}/problems/${problemId}`),
    onSuccess: invalidateCatalogue,
  });
  const reorder = useMutation({
    mutationFn: (problemIds) => api.patch(`/admin/coding-library/sheets/${selectedId}/order`, { problemIds }),
    onSuccess: invalidateCatalogue,
  });
  const previewCsv = useMutation({
    mutationFn: async () => (await api.post("/admin/coding-library/import/preview", { csv })).data.data,
    onSuccess: setPreview,
  });
  const importCsv = useMutation({
    mutationFn: async () => (await api.post("/admin/coding-library/import", { csv })).data.data,
    onSuccess: (result) => {
      setPreview(null);
      setCsv("");
      setCsvName("");
      setImportMessage(`Imported ${result.imported} row(s); ${result.existingLinks} association(s) already existed.`);
      invalidateCatalogue();
    },
  });

  const selectedSheet = detail.data;
  const orderedProblems = useMemo(() => selectedSheet?.problems || [], [selectedSheet]);
  function moveProblem(index, direction) {
    const next = [...orderedProblems];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((problem) => problem.id));
  }
  function editProblem(problem) {
    setEditingProblem({
      id: problem.id,
      title: problem.title,
      summary: problem.summary || "",
      subtopic: problem.subtopic || "",
      difficulty: problem.difficulty,
      platform: problem.platform,
      url: problem.url,
      topic: problem.topic.name,
      patterns: problem.patterns.map(({ pattern }) => pattern.name).join("|"),
      placementPriority: problem.placementPriority ?? "",
      estimatedMinutes: problem.estimatedMinutes ?? "",
      attribution: problem.attribution || "",
      status: problem.status,
    });
  }
  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 250_000) {
      setCsv("");
      setCsvName("");
      setPreview(null);
      return;
    }
    file.text().then((text) => {
      setCsv(text);
      setCsvName(file.name);
      setPreview(null);
    }).catch((error) => {
      setCsv("");
      setCsvName("");
      setPreview({ errors: [{ row: 0, message: error.message || "The selected file could not be read." }] });
    });
  }

  if (sheetsQuery.isLoading || statsQuery.isLoading) return <p role="status" className="text-slate-500">Loading catalogue administration…</p>;
  if (sheetsQuery.isError || statsQuery.isError) return <section role="alert" className="rounded-xl bg-red-50 p-5 text-red-700"><p>{getApiError(sheetsQuery.error || statsQuery.error)}</p><button onClick={() => { sheetsQuery.refetch(); statsQuery.refetch(); }} className="mt-3 font-bold underline">Retry</button></section>;

  return <div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-[0.2em] text-red-700">Administrator tools</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Placement catalogue</h1><p className="mt-2 text-slate-600">Manage independently curated external problem metadata. This workflow never accepts or executes source code.</p></div>
      <button type="button" onClick={invalidateCatalogue} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold"><RefreshCw size={16} />Refresh catalogue</button>
    </header>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Catalogue statistics">
      {Object.entries(statsQuery.data).map(([key, value]) => <article key={key} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></article>)}
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-950">Sheets</h2>
        <button type="button" onClick={() => { setSelectedId(""); setEditingSheet(false); setSheetForm(emptySheet); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white"><Plus size={16} />Create a sheet</button>
        <div className="mt-4 space-y-2">{sheetsQuery.data.map((sheet) => <button key={sheet.id} type="button" onClick={() => { setSelectedId(sheet.id); setEditingSheet(false); }} className={`w-full rounded-xl border p-3 text-left ${selectedId === sheet.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}><span className="block font-semibold text-slate-900">{sheet.name}</span><span className="mt-1 block text-xs text-slate-500">{sheet.problemCount} links · {sheet.status.toLowerCase()} · {sheet.slug}</span></button>)}</div>
      </aside>

      <main className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{editingSheet ? "Edit sheet" : selectedId ? "Sheet details" : "Create sheet"}</h2>{selectedId && !editingSheet && <button type="button" onClick={() => setEditingSheet(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Edit sheet</button>}</div>
          {(!selectedId || editingSheet) && <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveSheet.mutate(); }}>
            <Field label="Sheet name"><input required minLength={2} maxLength={200} value={sheetForm.name} onChange={(event) => setSheetForm({ ...sheetForm, name: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
            <Field label="Source / attribution"><input required value={sheetForm.source} onChange={(event) => setSheetForm({ ...sheetForm, source: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Independently curated" /></Field>
            <Field label="Category"><input value={sheetForm.category} onChange={(event) => setSheetForm({ ...sheetForm, category: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
            <Field label="Estimated minutes"><input type="number" min="1" value={sheetForm.estimatedMinutes} onChange={(event) => setSheetForm({ ...sheetForm, estimatedMinutes: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
            <Field label="Publication status"><select value={sheetForm.status} onChange={(event) => setSheetForm({ ...sheetForm, status: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></Field>
            <Field label="Description"><textarea required rows={3} value={sheetForm.description} onChange={(event) => setSheetForm({ ...sheetForm, description: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
            <div className="flex items-end gap-2"><button disabled={saveSheet.isPending} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saveSheet.isPending ? "Saving…" : "Save sheet"}</button>{editingSheet && <button type="button" onClick={() => setEditingSheet(false)} className="rounded-xl border px-4 py-3 text-sm font-bold">Cancel</button>}</div>
            <ErrorMessage error={saveSheet.error} />
          </form>}
          {selectedId && !editingSheet && selectedSheet && <div className="mt-4"><p className="text-sm text-slate-600">{selectedSheet.description}</p><p className="mt-2 text-xs text-slate-500">Slug: {selectedSheet.slug} · Source: {selectedSheet.source} · Category: {selectedSheet.category} · Status: {selectedSheet.status}</p></div>}
          {selectedId && detail.isError && <ErrorMessage error={detail.error} />}
          {selectedId && detail.isLoading && <p role="status" className="mt-4 text-sm text-slate-500">Loading sheet details…</p>}
        </section>

        {selectedId && selectedSheet && <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-950">Add external problem</h2>
            <p className="mt-1 text-sm text-slate-600">New problems default to draft until their metadata and links are reviewed.</p>
            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); addProblem.mutate(); }}>
              <Field label="Title"><input required value={problemForm.title} onChange={(event) => setProblemForm({ ...problemForm, title: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="External problem URL"><input required type="url" value={problemForm.url} onChange={(event) => setProblemForm({ ...problemForm, url: event.target.value })} placeholder="https://" className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="Platform"><select value={problemForm.platform} onChange={(event) => setProblemForm({ ...problemForm, platform: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{platformOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>
              <Field label="Difficulty"><select value={problemForm.difficulty} onChange={(event) => setProblemForm({ ...problemForm, difficulty: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></Field>
              <Field label="Topic"><input required value={problemForm.topic} onChange={(event) => setProblemForm({ ...problemForm, topic: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="Subtopic"><input value={problemForm.subtopic} onChange={(event) => setProblemForm({ ...problemForm, subtopic: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="Patterns (separate with |)"><input value={problemForm.patterns} onChange={(event) => setProblemForm({ ...problemForm, patterns: event.target.value })} placeholder="Two pointers|Sliding window" className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="Status"><select value={problemForm.status} onChange={(event) => setProblemForm({ ...problemForm, status: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></Field>
              <Field label="Summary"><textarea rows={2} value={problemForm.summary} onChange={(event) => setProblemForm({ ...problemForm, summary: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <Field label="Attribution"><input value={problemForm.attribution} onChange={(event) => setProblemForm({ ...problemForm, attribution: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
              <div className="md:col-span-2"><button disabled={addProblem.isPending} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{addProblem.isPending ? "Adding…" : "Add to sheet"}</button><ErrorMessage error={addProblem.error} /></div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Problem associations</h2><p className="mt-1 text-sm text-slate-500">Reordering changes only this sheet’s sequence; removing an association does not delete canonical problems or student progress.</p></div><span className="text-sm text-slate-500">{orderedProblems.length} associated</span></div>
            <div className="mt-4 divide-y divide-slate-100">{orderedProblems.map((problem, index) => <div key={problem.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs text-slate-500">{problem.sequence}. {problem.topic.name} · {problem.platform} · {problem.difficulty}</p><p className="mt-1 font-semibold text-slate-950">{problem.title}</p><p className="mt-1 break-all text-xs text-slate-500">{problem.url}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${problem.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{problem.status}</span>{problem.verifiedAt && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck size={14} />Verified</span>}</div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => moveProblem(index, -1)} disabled={index === 0 || reorder.isPending} className="rounded-lg border px-2.5 py-2 text-sm disabled:opacity-40">↑</button><button type="button" onClick={() => moveProblem(index, 1)} disabled={index === orderedProblems.length - 1 || reorder.isPending} className="rounded-lg border px-2.5 py-2 text-sm disabled:opacity-40">↓</button><button type="button" onClick={() => editProblem(problem)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Edit</button><button type="button" onClick={() => setCompanyTarget(companyTarget === problem.id ? "" : problem.id)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Company tag</button><button type="button" onClick={() => verifyLink.mutate({ id: problem.id, verified: !problem.verifiedAt })} disabled={verifyLink.isPending} className="rounded-lg border px-3 py-2 text-sm font-semibold">{problem.verifiedAt ? "Unverify link" : "Verify link"}</button><button type="button" onClick={() => removeAssociation.mutate(problem.id)} disabled={removeAssociation.isPending} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Remove</button></div>
              </div>
              {problem.companies.length > 0 && <p className="mt-2 text-xs text-slate-500">Company tags: {problem.companies.map((company) => `${company.companyName}${company.verifiedAt ? " (verified)" : " (unverified)"}`).join(", ")}</p>}
              {companyTarget === problem.id && <form className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveCompany.mutate(); }}>
                <Field label="Company"><input required value={companyForm.companyName} onChange={(event) => setCompanyForm({ ...companyForm, companyName: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <Field label="Public source URL"><input required type="url" value={companyForm.evidenceUrl} onChange={(event) => setCompanyForm({ ...companyForm, evidenceUrl: event.target.value })} placeholder="https://" className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={companyForm.verified} onChange={(event) => setCompanyForm({ ...companyForm, verified: event.target.checked })} />I reviewed this source and verify the tag</label>
                <div><button disabled={saveCompany.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">{saveCompany.isPending ? "Saving…" : "Save company tag"}</button><button type="button" onClick={() => setCompanyTarget("")} className="ml-2 rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button></div>
              </form>}
              {editingProblem?.id === problem.id && <form className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); updateProblem.mutate(); }}>
                <Field label="Title"><input required value={editingProblem.title} onChange={(event) => setEditingProblem({ ...editingProblem, title: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <Field label="External URL"><input required type="url" value={editingProblem.url} onChange={(event) => setEditingProblem({ ...editingProblem, url: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <Field label="Topic"><input required value={editingProblem.topic} onChange={(event) => setEditingProblem({ ...editingProblem, topic: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <Field label="Patterns (separate with |)"><input value={editingProblem.patterns} onChange={(event) => setEditingProblem({ ...editingProblem, patterns: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <Field label="Difficulty"><select value={editingProblem.difficulty} onChange={(event) => setEditingProblem({ ...editingProblem, difficulty: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{["EASY", "MEDIUM", "HARD"].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Platform"><select value={editingProblem.platform} onChange={(event) => setEditingProblem({ ...editingProblem, platform: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">{platformOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Status"><select value={editingProblem.status} onChange={(event) => setEditingProblem({ ...editingProblem, status: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></Field>
                <Field label="Attribution"><input value={editingProblem.attribution} onChange={(event) => setEditingProblem({ ...editingProblem, attribution: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></Field>
                <div className="md:col-span-2"><button disabled={updateProblem.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Save problem</button><button type="button" onClick={() => setEditingProblem(null)} className="ml-2 rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button><ErrorMessage error={updateProblem.error} /></div>
              </form>}
            </div>)}</div>
            <ErrorMessage error={verifyLink.error || removeAssociation.error || reorder.error || saveCompany.error} />
          </section>
        </>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-950">CSV import</h2>
          <p className="mt-1 text-sm text-slate-600">Required headers: <code>sheetSlug,title,difficulty,platform,url,topic</code>. Optional: summary, subtopic, patterns (use |), placementPriority, estimatedMinutes, attribution, status. Upload is limited to 2,000 rows and preview never writes catalogue data.</p>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileUp size={18} />{csvName || "Choose a CSV file"}<input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" /></label>
          {csv && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => previewCsv.mutate()} disabled={previewCsv.isPending} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">{previewCsv.isPending ? "Checking…" : "Preview import"}</button><button type="button" onClick={() => { setCsv(""); setCsvName(""); setPreview(null); }} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600">Clear</button></div>}
          {preview && <div className="mt-4 rounded-xl bg-slate-50 p-4">
            {preview.errors?.length ? <div role="alert"><p className="font-bold text-red-700">{preview.errors.length} issue(s) need attention before import.</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">{preview.errors.slice(0, 20).map((error, index) => <li key={`${error.row}-${index}`}>Row {error.row}: {error.message}</li>)}</ul></div> : <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={18} />Preview passed · {preview.validRows} valid rows</p>}
            <p className="mt-2 text-sm text-slate-600">{preview.duplicates?.length || 0} canonical problem(s) already exist; {preview.alreadyAssociated?.length || 0} already belong to this sheet.</p>
            {!preview.errors?.length && <button type="button" onClick={() => importCsv.mutate()} disabled={importCsv.isPending} className="mt-3 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{importCsv.isPending ? "Importing…" : "Import validated rows"}</button>}
          </div>}
          {importMessage && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{importMessage}</p>}
          <ErrorMessage error={previewCsv.error || importCsv.error} />
        </section>
      </main>
    </div>
  </div>;
}

function sheetPayload(form) {
  return {
    name: form.name,
    description: form.description,
    source: form.source,
    category: form.category,
    estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
    status: form.status,
  };
}

function problemPayload(form, partial = false) {
  const payload = {
    title: form.title,
    summary: form.summary || null,
    subtopic: form.subtopic || null,
    difficulty: form.difficulty,
    platform: form.platform,
    url: form.url,
    topic: form.topic,
    patterns: String(form.patterns || "").split("|").map((value) => value.trim()).filter(Boolean),
    placementPriority: form.placementPriority ? Number(form.placementPriority) : null,
    estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
    attribution: form.attribution || null,
    status: form.status,
  };
  if (!partial) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
