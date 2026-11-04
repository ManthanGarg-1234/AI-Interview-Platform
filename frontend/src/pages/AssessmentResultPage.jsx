import { ArrowLeft, CheckCircle2, Clock, Target, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function AssessmentResultPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["assessment-result", id],
    queryFn: async () => (await api.get(`/me/assessments/attempts/${id}`)).data.data,
  });

  if (query.isLoading) return (
    <div className="max-w-4xl space-y-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />)}
    </div>
  );
  if (query.isError) return (
    <div className="rounded-2xl bg-red-50 p-6 text-red-700">
      <p>{getApiError(query.error)}</p>
      <button onClick={() => query.refetch()} className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-bold">Retry</button>
    </div>
  );

  const attempt = query.data;
  const { assessment, result, questions, answers } = attempt;
  const total = (result?.correctCount || 0) + (result?.incorrectCount || 0) + (result?.unattemptedCount || 0);
  const accuracy = total > 0 ? Math.round(((result?.correctCount || 0) / total) * 100) : 0;
  const durationSecs = attempt.startedAt && attempt.submittedAt
    ? Math.round((new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 1000)
    : null;

  // Build answer lookup
  const answerMap = Object.fromEntries((answers || []).map((a) => [a.questionId, a.answer]));

  return (
    <div className="max-w-5xl">
      <Link to="/student/assessments" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline">
        <ArrowLeft size={14} /> Back to assessments
      </Link>

      <div className="mt-4">
        <h1 className="text-3xl font-bold text-slate-950">{assessment?.title}</h1>
        <p className="mt-1 text-slate-500">{assessment?.type} · Attempt #{attempt.attemptNumber}</p>
      </div>

      {/* Score overview */}
      <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-indigo-200 text-sm font-semibold">Final score</p>
            <p className="text-5xl font-black mt-1">{attempt.score != null ? Number(attempt.score).toFixed(0) : "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Correct", value: result?.correctCount ?? "—", color: "text-emerald-300" },
              { label: "Incorrect", value: result?.incorrectCount ?? "—", color: "text-red-300" },
              { label: "Skipped", value: result?.unattemptedCount ?? "—", color: "text-slate-300" },
              { label: "Accuracy", value: `${accuracy}%`, color: "text-white" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs text-indigo-200 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {durationSecs != null && (
          <p className="mt-4 text-sm text-indigo-200 flex items-center gap-1.5">
            <Clock size={14} /> Time taken: {Math.floor(durationSecs / 60)}m {durationSecs % 60}s
          </p>
        )}
      </div>

      {/* Next steps */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link to="/student/assessments" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition-colors">
          <Target size={18} className="text-indigo-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Try another assessment</span>
        </Link>
        <Link to="/student/analytics" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition-colors">
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">View performance analytics</span>
        </Link>
        <Link to="/student/mentor" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition-colors">
          <XCircle size={18} className="text-violet-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Ask mentor about weak areas</span>
        </Link>
      </div>

      {/* Question-by-question review */}
      {questions?.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-950 mb-4">Question review</h2>
          <div className="space-y-4">
            {questions.map((q, i) => {
              const studentAnswer = answerMap[q.id];
              const normalizeAns = (a) => Array.isArray(a) ? a.map(String).sort().join(", ") : String(a ?? "").trim();
              const correct = q.answerKey !== undefined
                ? normalizeAns(studentAnswer) === normalizeAns(q.answerKey)
                : null;

              return (
                <div key={q.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${correct === true ? "border-emerald-200" : correct === false ? "border-red-200" : "border-slate-200"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 rounded-full p-1 ${correct === true ? "bg-emerald-100" : correct === false ? "bg-red-100" : "bg-slate-100"}`}>
                      {correct === true ? <CheckCircle2 size={16} className="text-emerald-600" /> : correct === false ? <XCircle size={16} className="text-red-500" /> : <span className="h-4 w-4 block" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">Q{i + 1}. {q.body}</p>

                      {/* Options */}
                      {q.options?.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {q.options.map((opt) => {
                            const isSelected = Array.isArray(studentAnswer) ? studentAnswer.includes(opt.value) : studentAnswer === opt.value;
                            const isCorrectOption = Array.isArray(q.answerKey) ? q.answerKey.includes(opt.value) : q.answerKey === opt.value;
                            return (
                              <div key={opt.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${isCorrectOption ? "bg-emerald-50 text-emerald-800 font-semibold" : isSelected && !isCorrectOption ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>
                                <span className="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold">{opt.label}</span>
                                {opt.value}
                                {isCorrectOption && <CheckCircle2 size={13} className="ml-auto text-emerald-500 shrink-0" />}
                                {isSelected && !isCorrectOption && <XCircle size={13} className="ml-auto text-red-500 shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Your answer (non-MCQ) */}
                      {!q.options?.length && studentAnswer !== undefined && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-slate-500 mb-1">Your answer</p>
                          <p className={`rounded-xl px-3 py-2 text-sm font-medium ${correct ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{normalizeAns(studentAnswer) || "Not answered"}</p>
                        </div>
                      )}

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
                          <span className="font-semibold">Explanation: </span>{q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
