import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, getApiError } from "../lib/api";
import { AuthShell, Field } from "./LoginPage";

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/password-reset/confirm", { ...form, token });
      setCompleted(true);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use a strong password you have not used before.">
      {completed ? (
        <div className="space-y-5">
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Your password has been updated. Sign in with your new password.</p>
          <Link className="block rounded-xl bg-indigo-600 px-4 py-3 text-center font-bold text-white hover:bg-indigo-700" to="/login">Sign in</Link>
        </div>
      ) : !token ? (
        <div className="space-y-5">
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This password reset link is missing its token.</p>
          <Link className="font-bold text-indigo-600" to="/forgot-password">Request another link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="New password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <Field label="Confirm new password" type="password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} />
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
          <button disabled={submitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? "Updating password…" : "Update password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
