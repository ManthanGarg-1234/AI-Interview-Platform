import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";
import { homePathForRole } from "../lib/routes";
import { completeFirebaseGoogleRedirect, firebaseGoogleConfigured, getFirebaseAuthError, signInWithFirebaseGoogleRedirect } from "../lib/firebase";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [googlePending, setGooglePending] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacyPolicy, setAcceptedPrivacyPolicy] = useState(false);
  const [role, setRole] = useState("STUDENT");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (!firebaseGoogleConfigured()) return;
    let active = true;
    completeFirebaseGoogleRedirect()
      .then(async (idToken) => {
        if (!active || !idToken) return;
        const consentTerms = sessionStorage.getItem("career_firebase_terms") === "true";
        const consentPrivacy = sessionStorage.getItem("career_firebase_privacy") === "true";
        const onboardingRole = sessionStorage.getItem("career_firebase_role") || "STUDENT";
        sessionStorage.removeItem("career_firebase_terms");
        sessionStorage.removeItem("career_firebase_privacy");
        sessionStorage.removeItem("career_firebase_role");
        setGooglePending(true);
        setError("");
        try {
          const response = await api.post("/auth/firebase/google", {
            idToken,
            acceptedTerms: consentTerms,
            acceptedPrivacyPolicy: consentPrivacy,
            role: onboardingRole,
          });
          await queryClient.invalidateQueries({ queryKey: ["current-user"] });
          window.location.assign(homePathForRole(response.data.data.role));
        } catch (requestError) {
          if (requestError?.response?.data?.error?.code === "CONSENT_REQUIRED") {
            setError("Create a new account from the registration page and accept both consent checkboxes.");
          } else if (requestError?.code?.startsWith("auth/")) {
            setError(getFirebaseAuthError(requestError));
          } else {
            setError(getApiError(requestError));
          }
        } finally {
          if (active) setGooglePending(false);
        }
      })
      .catch((requestError) => {
        if (active) setError(getFirebaseAuthError(requestError));
      });
    return () => { active = false; };
  }, [navigate, queryClient]);
  const oauthNotice = {
    failed: "Google sign-in did not complete. Try again.",
    "link-required": "An account with this email already exists. Sign in with that account; Google was not linked automatically.",
    unavailable: "This account cannot sign in. Contact support if you believe this is an error.",
  }[searchParams.get("oauth")];
  async function submit(event) {
    event.preventDefault(); setError("");
    try { const response = await api.post("/auth/login", form); await queryClient.invalidateQueries({ queryKey: ["current-user"] }); navigate(homePathForRole(response.data.data.role)); }
    catch (requestError) { setError(await getApiError(requestError)); }
  }
  async function startGoogleSignIn() {
    setError("");
    setGooglePending(true);
    try {
      if (firebaseGoogleConfigured()) {
        if (!acceptedTerms || !acceptedPrivacyPolicy) {
          setError("Accept the Terms of Service and Privacy Policy before continuing with Google.");
          setGooglePending(false);
          return;
        }
        sessionStorage.setItem("career_firebase_terms", "true");
        sessionStorage.setItem("career_firebase_privacy", "true");
        sessionStorage.setItem("career_firebase_role", role);
        await signInWithFirebaseGoogleRedirect();
        return;
      }
      const response = await api.post("/auth/google/start", { acceptedTerms: false, acceptedPrivacyPolicy: false });
      window.location.assign(response.data.data.authorizationUrl);
    } catch (requestError) {
      if (requestError?.code?.startsWith("auth/")) setError(getFirebaseAuthError(requestError));
      else setError(getApiError(requestError));
      setGooglePending(false);
    }
  }
  return <AuthShell title="Welcome back" subtitle="Sign in to continue your career journey.">
    {oauthNotice && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthNotice}</p>}
    <div className="mb-4 space-y-2 text-sm text-slate-700">
      <label className="flex items-start gap-3"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1" /><span>I accept the CareerPrepAI Terms of Service.</span></label>
      <label className="flex items-start gap-3"><input type="checkbox" checked={acceptedPrivacyPolicy} onChange={(event) => setAcceptedPrivacyPolicy(event.target.checked)} className="mt-1" /><span>I acknowledge the CareerPrepAI Privacy Policy.</span></label>
    </div>
    <label className="mb-4 block text-sm font-semibold text-slate-700">If you are creating a new Google account, I am a
      <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
        <option value="STUDENT">Student</option>
        <option value="RECRUITER">Recruiter</option>
      </select>
    </label>
    <button type="button" disabled={googlePending || !acceptedTerms || !acceptedPrivacyPolicy} onClick={startGoogleSignIn} className="mb-5 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
      {googlePending ? "Connecting to Google…" : "Continue with Google"}
    </button>
    <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or with email<span className="h-px flex-1 bg-slate-200" /></div>
    <form onSubmit={submit} className="space-y-5">
    <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
    <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
    <p className="-mt-2 text-right text-sm"><Link className="font-semibold text-indigo-600 hover:text-indigo-700" to="/forgot-password">Forgot password?</Link></p>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
    <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-indigo-700">Sign in</button>
    <p className="text-center text-sm text-slate-500">New here? <Link className="font-bold text-indigo-600" to="/register">Create an account</Link></p>
    </form>
  </AuthShell>;
}

export function AuthShell({ title, subtitle, children }) { return <main className="grid min-h-screen place-items-center bg-linear-to-br from-slate-950 via-indigo-950 to-slate-900 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><div className="mb-8"><div className="mb-6 grid size-12 place-items-center rounded-2xl bg-indigo-600 font-black text-white">CP</div><h1 className="text-3xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-slate-500">{subtitle}</p></div>{children}</section></main>; }
export function Field({ label, type, value, onChange }) { return <label className="block text-sm font-semibold text-slate-700">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>; }
