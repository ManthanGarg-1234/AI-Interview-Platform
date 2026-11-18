import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function InterviewRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["interview", id], queryFn: async () => (await api.get(`/me/interviews/${id}`)).data.data });
  const interview = query.data;
  const current = interview?.questions?.find((question) => !question.answers?.length) || interview?.questions?.at(-1);
  const savedAnswer = current?.answers?.[0];
  const answerText = savedAnswer?.text || answer;
  const start = useMutation({ mutationFn: () => api.post(`/me/interviews/${id}/start`), onSuccess: () => query.refetch(), onError: (error) => setMessage(getApiError(error)) });
  const submit = useMutation({
    mutationFn: (complete) => api.post(`/me/interviews/${id}/answers`, { questionId: current.id, text: answerText, complete }),
    onSuccess: ({ data }) => {
      setAnswer("");
      if (data.data.status === "COMPLETED") navigate(`/student/interviews/${id}`);
      else query.refetch();
    },
    onError: (error) => {
      setMessage(getApiError(error));
      query.refetch();
    },
  });

  if (query.isLoading) return <p className="text-slate-500">Loading interview…</p>;
  if (query.isError) return <p className="rounded-xl bg-red-50 p-5 text-red-700">{getApiError(query.error)}</p>;
  if (interview.status === "CONFIGURED") return <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold">Ready when you are</h1>
    <p className="mt-2 text-slate-600">{interview.configuration.targetRole} · {interview.configuration.questionCount} questions</p>
    <button onClick={() => start.mutate()} disabled={start.isPending} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">{start.isPending ? "Preparing…" : "Begin interview"}</button>
    {message && <p role="alert" className="mt-3 text-red-600">{message}</p>}
  </section>;
  if (interview.status === "COMPLETED") return <section className="rounded-2xl bg-emerald-50 p-8 text-emerald-800">
    <h1 className="text-2xl font-bold">Interview complete</h1>
    <button onClick={() => navigate(`/student/interviews/${id}`)} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">View results</button>
  </section>;
  if (!current) return <p className="rounded-xl bg-amber-50 p-5 text-amber-800">No interview question is available. Please return to interview history and retry.</p>;

  return <section className="max-w-4xl">
    <div className="flex flex-wrap justify-between gap-2">
      <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Question {current.sequence} of {interview.configuration.questionCount}</p>
      <span className="text-sm text-slate-500">{interview.configuration.type}</span>
    </div>
    {current.generatedBy === "mock" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Practice template question — no AI provider is configured, so this question was not AI-generated.</p>}
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">{current.text}</h1>
      {savedAnswer && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Your answer has been saved. Retry evaluation to continue without submitting a duplicate answer.</p>}
      <textarea value={answerText} onChange={(event) => setAnswer(event.target.value)} disabled={Boolean(savedAnswer)} rows="10" placeholder="Write your answer…" className="mt-6 w-full rounded-xl border border-slate-300 p-4 disabled:bg-slate-50" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button disabled={!answerText.trim() || submit.isPending} onClick={() => submit.mutate(false)} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{savedAnswer ? "Retry evaluation" : "Submit answer"}</button>
        <button disabled={!answerText.trim() || submit.isPending} onClick={() => submit.mutate(true)} className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 disabled:opacity-50">{savedAnswer ? "Retry and finish" : "Submit and finish"}</button>
      </div>
      {message && <p role="alert" className="mt-3 text-red-600">{message}</p>}
    </div>
  </section>;
}
