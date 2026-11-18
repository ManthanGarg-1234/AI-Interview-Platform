import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

const pageSize = 20;

export default function RecruiterCandidatesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["recruiter-candidates", search, page],
    queryFn: async () => (await api.get("/recruiter/candidates", { params: { q: search, page, limit: pageSize } })).data.data,
  });

  if (query.isLoading) return <p>Loading candidates…</p>;
  if (query.isError) return <p className="text-red-600">{getApiError(query.error)}</p>;

  const { items, pages, total } = query.data;
  return (
    <section className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Recruiter workspace</p>
      <h1 className="mt-2 text-3xl font-bold">Candidates</h1>
      <p className="mt-2 text-slate-600">Discover candidates who have enabled profile discovery.</p>
      <label className="mt-6 block max-w-xl text-sm font-semibold text-slate-700">
        Search candidates
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search by name or headline"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
        />
      </label>
      <p className="mt-5 text-sm text-slate-500">{total} candidates</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white p-5 text-slate-600">No discoverable candidates found.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 rounded-2xl bg-white shadow-sm">
          {items.map((candidate) => {
            const profile = candidate.studentProfile || {};
            const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Candidate";
            return (
              <li key={candidate.id} className="p-5">
                <h2 className="font-bold text-slate-900">{name}</h2>
                {profile.headline && <p className="mt-1 text-slate-600">{profile.headline}</p>}
                {profile.location && <p className="mt-1 text-sm text-slate-500">{profile.location}</p>}
                {profile.skills?.length > 0 && (
                  <ul aria-label={`${name} skills`} className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map(({ id, skill }) => (
                      <li key={id} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700">{skill.name}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Candidate pages" className="mt-5 flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Previous</button>
          <span className="text-sm text-slate-600">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Next</button>
        </nav>
      )}
    </section>
  );
}
