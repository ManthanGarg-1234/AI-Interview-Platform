import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, getApiError } from "../lib/api";
import { AuthShell } from "./LoginPage";

export default function VerifyEmailPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  const submitted = useRef(false);
  const [status, setStatus] = useState("Verifying your email…");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || submitted.current) {
      if (!token) setError("This verification link is missing its token.");
      return;
    }
    submitted.current = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    api.post("/auth/verify-email", { token })
      .then(() => setStatus("Email verified. You can now sign in."))
      .catch((requestError) => setError(getApiError(requestError)));
  }, [token]);

  return (
    <AuthShell title="Email verification" subtitle="Complete your CareerPrepAI account setup.">
      <div className="space-y-5">
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{status}</p>}
        <Link className="block rounded-xl bg-indigo-600 px-4 py-3 text-center font-bold text-white hover:bg-indigo-700" to="/login">Continue to sign in</Link>
        {error && <p className="text-center text-sm text-slate-500">Need another link? <Link className="font-bold text-indigo-600" to="/register">Return to registration</Link></p>}
      </div>
    </AuthShell>
  );
}
