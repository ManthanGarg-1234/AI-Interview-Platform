import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getApiError } from "../lib/api";
import { AuthShell, Field } from "./LoginPage";
import { completeFirebaseGoogleRedirect, firebaseGoogleConfigured, getFirebaseAuthError, signInWithFirebaseGoogleRedirect } from "../lib/firebase";
import { homePathForRole } from "../lib/routes";

const initialForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "STUDENT",
  acceptedTerms: false,
  acceptedPrivacyPolicy: false,
};

function validateRegistration(form) {
  if (form.name.trim().length < 2) return "Full name must be at least 2 characters.";
  if (form.password.length < 12) return "Password must be at least 12 characters.";
  const characterTypes = [
    /[a-z]/,
    /[A-Z]/,
    /\d/,
    /[^A-Za-z0-9]/,
  ].filter((pattern) => pattern.test(form.password)).length;
  if (characterTypes < 3) return "Password must use at least three character types: lowercase, uppercase, number, or symbol.";
  if (form.password !== form.confirmPassword) return "Passwords do not match.";
  return "";
}

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [searchParams] = useSearchParams();
  const oauthNotice = {
    failed: "Google sign-in did not complete. Try again.",
    "consent-required": "Accept both consent checkboxes before creating an account with Google.",
    "link-required": "An account with this email already exists. Sign in with that account; Google was not linked automatically.",
  }[searchParams.get("oauth")];

  useEffect(() => {
    if (!firebaseGoogleConfigured()) return;
    let active = true;
    completeFirebaseGoogleRedirect()
      .then(async (idToken) => {
        if (!active || !idToken) return;
        const acceptedTerms = sessionStorage.getItem("career_firebase_terms") === "true";
        const acceptedPrivacyPolicy = sessionStorage.getItem("career_firebase_privacy") === "true";
        const onboardingRole = sessionStorage.getItem("career_firebase_role") || form.role;
        sessionStorage.removeItem("career_firebase_terms");
        sessionStorage.removeItem("career_firebase_privacy");
        sessionStorage.removeItem("career_firebase_role");
        setGooglePending(true);
        setError("");
        try {
          const response = await api.post("/auth/firebase/google", {
            idToken,
            acceptedTerms,
            acceptedPrivacyPolicy,
            role: onboardingRole,
          });
          window.location.assign(homePathForRole(response.data.data.role));
        } catch (requestError) {
          if (requestError?.code?.startsWith("auth/")) setError(getFirebaseAuthError(requestError));
          else setError(getApiError(requestError));
        } finally {
          if (active) setGooglePending(false);
        }
      })
      .catch((requestError) => {
        if (active) setError(getFirebaseAuthError(requestError));
      });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const validationError = validateRegistration(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post("/auth/register", form);
      setSubmittedEmail(response.data.data.email);
    } catch (requestError) {
      if (requestError?.response?.data?.error?.code === "EMAIL_PROVIDER_FAILED") {
        setSubmittedEmail(form.email);
        setDeliveryFailed(true);
      }
      if (requestError?.response?.status === 429) {
        const retryAfter = Number(requestError.response.headers?.["retry-after"]);
        setError(retryAfter > 0
          ? `Too many authentication attempts. Try again in ${retryAfter} seconds.`
          : "Too many authentication attempts. Try again later.");
      } else {
        setError(getApiError(requestError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    setError("");
    setResendMessage("");
    try {
      const response = await api.post("/auth/resend-verification", { email: submittedEmail || form.email });
      setResendMessage(response.data.message);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function startGoogleRegistration() {
    setError("");
    setGooglePending(true);
    try {
      if (firebaseGoogleConfigured()) {
        sessionStorage.setItem("career_firebase_terms", String(form.acceptedTerms));
        sessionStorage.setItem("career_firebase_privacy", String(form.acceptedPrivacyPolicy));
        sessionStorage.setItem("career_firebase_role", form.role);
        await signInWithFirebaseGoogleRedirect();
        return;
      }
      const response = await api.post("/auth/google/start", {
        acceptedTerms: form.acceptedTerms,
        acceptedPrivacyPolicy: form.acceptedPrivacyPolicy,
      });
      window.location.assign(response.data.data.authorizationUrl);
    } catch (requestError) {
      if (requestError?.code?.startsWith("auth/")) setError(getFirebaseAuthError(requestError));
      else setError(getApiError(requestError));
      setGooglePending(false);
    }
  }

  if (submittedEmail) {
    return (
      <AuthShell title={deliveryFailed ? "Email delivery delayed" : "Check your email"} subtitle={deliveryFailed ? `Your account was created, but a verification link could not be delivered to ${submittedEmail}.` : `We sent a verification link to ${submittedEmail}.`}>
        <div className="space-y-5">
          <p role="status" className={`rounded-xl border p-4 text-sm leading-6 ${deliveryFailed ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            {deliveryFailed ? "Email service is unavailable. You can request a new link after service is restored." : "Verify your email before signing in. The link expires in 24 hours."}
          </p>
          {resendMessage && <p role="status" className="text-sm text-slate-600">{resendMessage}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
          <button type="button" onClick={resendVerification} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-800 hover:bg-slate-50">
            Resend verification email
          </button>
          <p className="text-center text-sm text-slate-500">Already verified? <Link className="font-bold text-indigo-600" to="/login">Sign in</Link></p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Start building your evidence-backed career profile.">
      <form onSubmit={submit} className="space-y-4">
        {oauthNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthNotice}</p>}
        <Field label="Full name" type="text" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
        <p className="-mt-2 text-xs text-slate-500">Use at least 12 characters with three character types: lowercase, uppercase, number, or symbol.</p>
        <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(value) => setForm({ ...form, confirmPassword: value })} />
        <label className="block text-sm font-semibold text-slate-700">
          I am a
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
            <option value="STUDENT">Student</option>
            <option value="RECRUITER">Recruiter</option>
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <input required type="checkbox" checked={form.acceptedTerms} onChange={(event) => setForm({ ...form, acceptedTerms: event.target.checked })} className="mt-1 size-4 accent-indigo-600" />
          <span>I accept the CareerPrepAI Terms of Service.</span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <input required type="checkbox" checked={form.acceptedPrivacyPolicy} onChange={(event) => setForm({ ...form, acceptedPrivacyPolicy: event.target.checked })} className="mt-1 size-4 accent-indigo-600" />
          <span>I acknowledge the CareerPrepAI Privacy Policy.</span>
        </label>
        {form.role === "STUDENT" ? (
          <button type="button" disabled={googlePending || !form.acceptedTerms || !form.acceptedPrivacyPolicy} onClick={startGoogleRegistration} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {googlePending ? "Connecting to Google…" : "Create account with Google"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Google sign-up is currently available for student accounts. Recruiters can use email registration.</p>
        )}
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or with email<span className="h-px flex-1 bg-slate-200" /></div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
        <button disabled={submitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-sm text-slate-500">Already registered? <Link className="font-bold text-indigo-600" to="/login">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
