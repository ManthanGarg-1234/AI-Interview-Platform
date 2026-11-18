import { ArrowRight, BookOpen, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

const difficulties = [
  ["EASY", "Easy"],
  ["MEDIUM", "Medium"],
  ["HARD", "Hard"],
];
const platforms = [
  ["LEETCODE", "LeetCode"],
  ["GFG", "GeeksforGeeks"],
  ["CODE360", "Code360"],
  ["HACKERRANK", "HackerRank"],
  ["CODECHEF", "CodeChef"],
  ["INTERVIEWBIT", "InterviewBit"],
  ["CODEFORCES", "Codeforces"],
];
const progressOptions = [
  ["NOT_STARTED", "Not started"],
  ["IN_PROGRESS", "In progress"],
  ["COMPLETED", "Completed"],
];

export default function CodingPracticePage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("popularity");
  const [page, setPage] = useState(1);
  const filters = { search, source, category, difficulty, platform, status, sort, page, pageSize: 12 };

  const sheets = useQuery({
    queryKey: ["coding-library", "sheets", filters],
    queryFn: async () => (await api.get("/coding/library/sheets", {
      params: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "")),
    })).data.data,
  });

  function updateFilter(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function resetFilters() {
    setSearch("");
    setSource("");
    setCategory("");
    setDifficulty("");
    setPlatform("");
    setStatus("");
    setSort("popularity");
    setPage(1);
  }

  const items = sheets.data?.items || [];
  const loading = sheets.isLoading;

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Placement preparation</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Problem sheets</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Follow a focused DSA roadmap, track what you have solved, and practice on LeetCode, GeeksforGeeks, Code360, and more. No in-app editor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/student/coding/sheets" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Browse all sheets <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section aria-label="Filter problem sheets" className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2">
            <Search aria-hidden="true" className="absolute left-3 top-3 text-slate-400" size={16} />
            <input aria-label="Search sheets" value={search} onChange={updateFilter(setSearch)} placeholder="Search sheets…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
          </label>
          <label className="sr-only" htmlFor="sheet-source">Sheet or author</label>
          <input id="sheet-source" value={source} onChange={updateFilter(setSource)} placeholder="Sheet / author (e.g. Striver)" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          <label className="sr-only" htmlFor="sheet-category">Category</label>
          <select id="sheet-category" value={category} onChange={updateFilter(setCategory)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="">All categories</option>
            <option value="DSA">Data structures & algorithms</option>
          </select>
          <label className="sr-only" htmlFor="sheet-difficulty">Difficulty</label>
          <select id="sheet-difficulty" value={difficulty} onChange={updateFilter(setDifficulty)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="">All difficulties</option>
            {difficulties.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="sheet-platform">Platform</label>
          <select id="sheet-platform" value={platform} onChange={updateFilter(setPlatform)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="">All platforms</option>
            {platforms.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="sheet-progress">Progress</label>
          <select id="sheet-progress" value={status} onChange={updateFilter(setStatus)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="">All progress</option>
            {progressOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="sheet-sort">Sort sheets</label>
          <select id="sheet-sort" value={sort} onChange={updateFilter(setSort)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="popularity">Most popular</option>
            <option value="problemCount">Most problems</option>
            <option value="name">Name</option>
          </select>
          <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <RotateCcw size={15} /> Reset filters
          </button>
        </div>
      </section>

      {sheets.isError ? (
        <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-5 text-sm text-red-700">
          <p>{getApiError(sheets.error)}</p>
          <button type="button" onClick={() => sheets.refetch()} className="mt-2 font-semibold underline">Try again</button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Curated collections</h2>
            {sheets.data && <span className="text-sm text-slate-500">{sheets.data.total} sheets</span>}
          </div>
          {loading ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-2xl bg-slate-200" />)}
            </div>
          ) : items.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((sheet) => (
                <article key={sheet.id} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700">
                      <BookOpen size={14} /> {sheet.category}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{sheet.totalProblems} problems</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-950">{sheet.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Curated by {sheet.source}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{sheet.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {difficulties.map(([value, label]) => sheet.difficultyCounts?.[value] > 0 && (
                      <span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{label} {sheet.difficultyCounts[value]}</span>
                    ))}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{sheet.topicCount} topics</span>
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{sheet.solved} / {sheet.totalProblems} solved</span>
                      <span>{sheet.completionPercent}%</span>
                    </div>
                    <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${sheet.completionPercent}%` }} />
                    </div>
                    <Link to={`/student/coding/sheets/${sheet.slug}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">
                      Open sheet <ArrowRight size={15} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <BookOpen className="mx-auto text-slate-400" size={30} />
              <h3 className="mt-3 font-bold text-slate-900">No sheets match these filters</h3>
              <p className="mt-1 text-sm text-slate-500">Try another search or clear the filters.</p>
              <button type="button" onClick={resetFilters} className="mt-4 text-sm font-bold text-indigo-700 hover:underline">Clear filters</button>
            </div>
          )}
          {sheets.data?.pages > 1 && (
            <nav aria-label="Sheet pages" className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-slate-500">Page {page} of {sheets.data.pages}</span>
              <button type="button" disabled={page >= sheets.data.pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
