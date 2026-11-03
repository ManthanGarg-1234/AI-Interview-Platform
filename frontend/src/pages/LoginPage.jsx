import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function submit(event) {
    event.preventDefault(); setError("");
    try { await api.post("/auth/login", form); await queryClient.invalidateQueries({ queryKey: ["current-user"] }); navigate("/app"); }
    catch (requestError) { setError(await getApiError(requestError)); }
  }
  return <AuthShell title="Welcome back" subtitle="Sign in to continue your career journey."><form onSubmit={submit} className="space-y-5">
    <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
    <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
    <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-indigo-700">Sign in</button>
    <p className="text-center text-sm text-slate-500">New here? <Link className="font-bold text-indigo-600" to="/register">Create an account</Link></p>
  </form></AuthShell>;
}

export function AuthShell({ title, subtitle, children }) { return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><div className="mb-8"><div className="mb-6 grid size-12 place-items-center rounded-2xl bg-indigo-600 font-black text-white">CP</div><h1 className="text-3xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-slate-500">{subtitle}</p></div>{children}</section></main>; }
export function Field({ label, type, value, onChange }) { return <label className="block text-sm font-semibold text-slate-700">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>; }
