import { Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function RecruiterCandidatesPage() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [skill, setSkill] = useState("");
  const [page, setPage] = useState(1);
  const candidates = useQuery({
    queryKey: ["recruiter-candidates", search, location, skill, page],
    queryFn: async () => (await api.get("/recruiter/candidates", { params: { q: search || undefined, location: location || undefined, skill: skill || undefined, page } })).data.data,
  });

  return (
    <div className="max-w-6xl">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Talent discovery</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Candidates</h1>
      <p className="mt-2 text-slate-600">Explore profiles that students have chosen to make discoverable.</p>

      <div className="mt-6 grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <label className="relative block">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or headline" className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3" />
        </label>
        <input value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }} placeholder="Location" className="rounded-xl border border-slate-300 px-4 py-3" />
        <input value={skill} onChange={(event) => { setSkill(event.target.value); setPage(1); }} placeholder="Skill" className="rounded-xl border border-slate-300 px-4 py-3" />
      </div>

      {candidates.isLoading ? (
        <p className="mt-8 text-slate-500">Loading candidates…</p>
      ) : candidates.isError ? (
        <div className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p>{getApiError(candidates.error)}</p>
          <button type="button" onClick={() => candidates.refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-2 font-bold">
            Try again
          </button>
        </div>
      ) : candidates.data.items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
          No discoverable candidates found. Students appear here only when they opt in to profile discovery.
        </p>
      ) : (
        <>
          <section className="mt-8 divide-y overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {candidates.data.items.map(({ id, fullName, email, studentProfile: profile }) => (
              <article key={id} className="p-5">
                <h2 className="font-bold text-slate-900">{profile?.firstName || fullName?.split(" ")[0]} {profile?.lastName || fullName?.split(" ").slice(1).join(" ")}</h2>
                <p className="mt-1 text-xs text-slate-400">{email}</p>
                <p className="mt-1 text-sm text-slate-600">{profile.headline || "No headline provided"}</p>
                {profile.location && <p className="mt-1 text-sm text-slate-500">{profile.location}</p>}
                {profile.educations?.length > 0 && <p className="mt-2 text-sm text-slate-600">{profile.educations[0].degree || "Education"} · {profile.educations[0].institution}</p>}
                {profile.resumes?.some((resume) => resume.activeVersion?.file?.scanStatus === "CLEAN") && <span className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Resume available</span>}
                {profile.skills.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map(({ skill }) => (
                      <li key={skill.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
          {candidates.data.pages > 1 && (
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {candidates.data.pages}</span>
              <button
                type="button"
                disabled={page === candidates.data.pages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
