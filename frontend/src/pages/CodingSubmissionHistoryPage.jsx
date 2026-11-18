import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function CodingSubmissionHistoryPage() {
  const [page, setPage] = useState(1);
  const submissions = useQuery({
    queryKey: ["coding-submissions", page],
    queryFn: async () => (await api.get("/coding/submissions", { params: { page } })).data.data,
  });

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Coding practice</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Submission history</h1>
          <p className="mt-2 text-slate-600">Review the status and results of your recent submissions.</p>
        </div>
        <Link to="/student/coding" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">
          All problems
        </Link>
      </div>

      {submissions.isLoading ? (
        <p className="mt-8 text-slate-500">Loading submissions…</p>
      ) : submissions.isError ? (
        <div className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p>{getApiError(submissions.error)}</p>
          <button type="button" onClick={() => submissions.refetch()} className="mt-3 rounded-lg border border-red-200 px-3 py-2 font-bold">
            Try again
          </button>
        </div>
      ) : submissions.data.items.length === 0 ? (
        <p className="mt-8 rounded-xl bg-white p-6 text-slate-500 shadow-sm">
          You haven’t submitted any solutions yet. Choose a problem to get started.
        </p>
      ) : (
        <>
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {submissions.data.items.map((submission) => (
                <article key={submission.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <Link to={`/student/coding/${submission.problem.slug}`} className="font-bold text-slate-900 hover:text-indigo-700">
                      {submission.problem.title}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {submission.problem.difficulty} · {submission.language} · {new Date(submission.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">{submission.verdict || submission.status}</p>
                    <p className="mt-1 text-sm text-slate-500">{submission.status}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          {submissions.data.pages > 1 && (
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {submissions.data.pages}</span>
              <button
                type="button"
                disabled={page === submissions.data.pages}
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
