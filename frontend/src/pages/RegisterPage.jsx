import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";
import { AuthShell, Field } from "./LoginPage";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STUDENT" });
  const [error, setError] = useState("");
  const navigate = useNavigate(); const queryClient = useQueryClient();
  async function submit(event) {
    event.preventDefault(); setError("");
    try { await api.post("/auth/register", form); await queryClient.invalidateQueries({ queryKey: ["current-user"] }); navigate("/app"); }
    catch (requestError) { setError(await getApiError(requestError)); }
  }
  return <AuthShell title="Create your account" subtitle="Start building your evidence-backed career profile."><form onSubmit={submit} className="space-y-4">
    <Field label="Full name" type="text" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
    <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
    <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
    <label className="block text-sm font-semibold text-slate-700">I am a<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"><option value="STUDENT">Student</option><option value="RECRUITER">Recruiter</option></select></label>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
    <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700">Create account</button>
    <p className="text-center text-sm text-slate-500">Already registered? <Link className="font-bold text-indigo-600" to="/login">Sign in</Link></p>
  </form></AuthShell>;
}
