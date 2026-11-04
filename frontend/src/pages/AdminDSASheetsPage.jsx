import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const example = JSON.stringify({
  name: "CareerPrepAI DSA Roadmap",
  slug: "careerprepai-dsa-roadmap",
  author: "CareerPrepAI",
  description: "A curated sequence of original practice problems and links to their source platforms.",
  problems: [
    { title: "Pair With Target Sum", difficulty: "Easy", topic: "Arrays", platform: "CareerPrepAI", problemSlug: "pair-with-target-sum" },
    { title: "Binary Search", difficulty: "Easy", topic: "Binary Search", platform: "CareerPrepAI", problemSlug: "binary-search" },
  ],
}, null, 2);

export default function AdminDSASheetsPage() {
  const queryClient = useQueryClient();
  const [json, setJson] = useState(example);
  const [parsed, setParsed] = useState(null);
  const [message, setMessage] = useState("");
  const preview = useMutation({
    mutationFn: (body) => api.post("/admin/dsa-sheets/import/preview", body),
    onSuccess: (response) => { setParsed(response.data.data); setMessage(""); },
    onError: async (error) => { setParsed(null); setMessage(await getApiError(error)); },
  });
  const importSheet = useMutation({
    mutationFn: (body) => api.post("/admin/dsa-sheets/import", { ...body, confirm: true }),
    onSuccess: (response) => {
      setMessage(`Imported "${response.data.data.name}" with ${response.data.data.importedProblems} problems.`);
      setParsed(null);
      queryClient.invalidateQueries({ queryKey: ["dsa-sheets"] });
    },
    onError: async (error) => setMessage(await getApiError(error)),
  });

  function requestPreview() {
    setMessage("");
    setParsed(null);
    try {
      preview.mutate(JSON.parse(json));
    } catch {
      setMessage("Enter valid JSON before previewing.");
    }
  }

  return (
    <section className="max-w-5xl">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Platform governance</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Import DSA sheet metadata</h1>
      <p className="mt-2 text-slate-600">Import titles, topic metadata, authorized external links, or mappings to published CareerPrepAI problems. Do not copy restricted statements or solutions.</p>
      <label className="mt-6 block text-sm font-semibold text-slate-700">Sheet JSON
        <textarea value={json} onChange={(event) => { setJson(event.target.value); setParsed(null); }} rows={18} spellCheck="false" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-4 font-mono text-sm" />
      </label>
      <button type="button" onClick={requestPreview} disabled={preview.isPending} className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{preview.isPending ? "Checking…" : "Preview import"}</button>
      {message && <p role="status" className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">{message}</p>}

      {parsed && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{parsed.name}</h2>
              <p className="text-sm text-slate-500">{parsed.problems.length} problems · {parsed.slug}</p>
            </div>
            <button type="button" disabled={!parsed.valid || importSheet.isPending} onClick={() => importSheet.mutate(parsed)} className="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{importSheet.isPending ? "Importing…" : "Confirm and import"}</button>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {parsed.problems.map((problem) => (
              <li key={`${problem.sequence}-${problem.title}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>{problem.sequence}. {problem.title} {problem.difficulty && `· ${problem.difficulty}`}</span>
                <span className={problem.valid ? "text-emerald-700" : "text-red-700"}>
                  {problem.duplicate ? "Duplicate entry" : problem.mapped ? "Mapped to published problem" : problem.externalUrl ? "External link" : "Add a valid mapping or URL"}
                </span>
              </li>
            ))}
          </ul>
          {!parsed.valid && <p className="mt-3 text-sm font-semibold text-red-700">Resolve invalid or duplicate rows before importing.</p>}
        </div>
      )}
      {preview.isError && <p role="alert" className="mt-4 text-sm text-red-700">{getApiError(preview.error)}</p>}
      {importSheet.isError && <p role="alert" className="mt-4 text-sm text-red-700">{getApiError(importSheet.error)}</p>}
    </section>
  );
}
