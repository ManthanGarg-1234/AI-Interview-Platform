import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";

export default function AssessmentInstructionsPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const start = useMutation({ mutationFn: () => api.post(`/me/assessments/${id}/attempts`), onSuccess: ({ data }) => navigate(`/student/assessments/attempts/${data.data.id}`) });
  return <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-3xl font-bold">Assessment instructions</h1><ul className="mt-5 list-disc space-y-2 pl-5 text-slate-600"><li>Your attempt is timed on the server.</li><li>Answers are saved automatically.</li><li>Correct answers and explanations appear only after submission.</li><li>Submitting is final for this attempt.</li></ul><button onClick={() => start.mutate()} disabled={start.isPending} className="mt-7 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">{start.isPending ? "Starting…" : "Start assessment"}</button>{start.isError && <p className="mt-3 text-red-600">{getApiError(start.error)}</p>}</section>;
}
