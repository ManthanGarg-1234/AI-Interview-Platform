import { useState } from "react";
import { Link } from "react-router-dom";
import { api, getApiError } from "../lib/api";
import { AuthShell, Field } from "./LoginPage";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/password-reset/request", { email });
      setRequested(true);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email to request a password reset link.">
      {requested ? (
        <div className="space-y-5">
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            If an eligible account exists, reset instructions will be sent if email delivery is available.
          </p>
          <Link className="block rounded-xl bg-indigo-600 px-4 py-3 text-center font-bold text-white hover:bg-indigo-700" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Email" type="email" value={email} onChange={setEmail} />
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
          <button disabled={submitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? "Sending request…" : "Send reset link"}
          </button>
          <p className="text-center text-sm text-slate-500"><Link className="font-bold text-indigo-600" to="/login">Return to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
