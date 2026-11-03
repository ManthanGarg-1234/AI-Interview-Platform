import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiError } from "../lib/api";

export default function StudentProfilePage() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["student-profile"], queryFn: async () => (await api.get("/me/profile")).data.data });
  const resumes = useQuery({ queryKey: ["student-resumes"], queryFn: async () => (await api.get("/me/resumes")).data.data });
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => { if (profile.data && !form) setForm(profile.data); }, [profile.data, form]);
  const save = useMutation({
    mutationFn: (data) => api.patch("/me/profile", data),
    onSuccess: () => { setMessage("Profile saved."); queryClient.invalidateQueries({ queryKey: ["student-profile"] }); },
    onError: async (error) => setMessage(await getApiError(error)),
  });
  const upload = useMutation({
    mutationFn: (file) => { const body = new FormData(); body.append("file", file); body.append("title", file.name); return api.post("/me/resumes", body, { headers: { "Content-Type": "multipart/form-data" } }); },
    onSuccess: () => { setMessage("Resume uploaded and queued for scanning."); queryClient.invalidateQueries({ queryKey: ["student-resumes"] }); },
    onError: async (error) => setMessage(await getApiError(error)),
  });
  if (profile.isLoading) return <State text="Loading profile…" />;
  if (profile.isError || !form) return <State text="Unable to load your profile." error />;
  return <div className="max-w-4xl">
    <h1 className="text-3xl font-bold text-slate-950">Your profile</h1>
    <p className="mt-2 text-slate-600">Control the information you use to build career evidence and discoverability.</p>
    <form className="mt-8 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(form); }}>
      <Field label="First name" value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} />
      <Field label="Last name" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} />
      <Field label="Headline" value={form.headline || ""} onChange={(value) => setForm({ ...form, headline: value })} />
      <Field label="Location" value={form.location || ""} onChange={(value) => setForm({ ...form, location: value })} />
      <label className="md:col-span-2 text-sm font-semibold text-slate-700">Bio<textarea value={form.bio || ""} onChange={(event) => setForm({ ...form, bio: event.target.value })} rows="4" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>
      <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 md:col-span-2"><input type="checkbox" checked={form.discoverable} onChange={(event) => setForm({ ...form, discoverable: event.target.checked })} className="size-4 accent-indigo-600" /> Allow recruiters to discover my profile</label>
      <div className="md:col-span-2 flex items-center gap-4"><button disabled={save.isPending} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{save.isPending ? "Saving…" : "Save profile"}</button>{message && <span className="text-sm text-slate-600">{message}</span>}</div>
    </form>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">Resumes</h2><p className="mt-1 text-sm text-slate-500">PDF or DOCX files up to 5 MB. Files start in pending scan state.</p></div><label className="cursor-pointer rounded-xl border border-indigo-200 px-4 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50">Upload resume<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => event.target.files[0] && upload.mutate(event.target.files[0])} /></label></div>
      <div className="mt-5 space-y-3">{resumes.data?.length ? resumes.data.map((resume) => <div key={resume.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><span className="font-semibold text-slate-800">{resume.title}</span><span className="text-xs font-bold uppercase tracking-wide text-amber-600">{resume.activeVersion?.file?.scanStatus || "PENDING"}</span></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No resumes uploaded yet.</p>}</div>
    </section>
  </div>;
}

function Field({ label, value, onChange }) { return <label className="text-sm font-semibold text-slate-700">{label}<input required value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>; }
function State({ text, error }) { return <div className={`rounded-2xl p-6 ${error ? "bg-red-50 text-red-700" : "bg-white text-slate-500"}`}>{text}</div>; }
