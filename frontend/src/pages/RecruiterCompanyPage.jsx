import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, getApiError, mapApiValidationError } from "../lib/api";
import { normalizeDomain, normalizeUrl, validateLogo } from "../lib/recruiterValidation";

const emptyCompany = { name: "", website: "", description: "", officialEmailDomain: "", logoUrl: "", metadata: { industry: "", companySize: "", headquarters: "", socialLinks: { linkedin: "", x: "", careers: "" } } };
const industries = ["Technology", "Finance", "Healthcare", "Education", "Retail", "Manufacturing", "Consulting", "Media", "Government", "Other"];
const sizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

export default function RecruiterCompanyPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyCompany);
  const [selectedId, setSelectedId] = useState("");
  const [logo, setLogo] = useState(null);
  const [invite, setInvite] = useState({ email: "", role: "HIRING_MANAGER" });
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const companies = useQuery({ queryKey: ["recruiter-companies"], queryFn: async () => (await api.get("/recruiter/companies")).data.data });
  const members = useQuery({ queryKey: ["company-members", selectedId], queryFn: async () => (await api.get(`/recruiter/companies/${selectedId}/members`)).data.data, enabled: Boolean(selectedId) });
  const save = useMutation({
    mutationFn: (payload) => selectedId ? api.patch(`/recruiter/companies/${selectedId}`, payload) : api.post("/recruiter/companies", payload),
    onSuccess: () => { setMessage("Company profile saved."); setErrors({}); queryClient.invalidateQueries({ queryKey: ["recruiter-companies"] }); queryClient.invalidateQueries({ queryKey: ["recruiter-dashboard"] }); },
    onError: (error) => { const mapped = mapApiValidationError(error); setErrors(mapped.fieldErrors); setMessage(mapped.summary || getApiError(error)); },
  });
  const inviteMember = useMutation({
    mutationFn: () => api.post(`/recruiter/companies/${selectedId}/members`, invite),
    onSuccess: () => { setInvite({ email: "", role: "HIRING_MANAGER" }); setMessage("Recruiter membership added."); members.refetch(); },
    onError: (error) => setMessage(getApiError(error)),
  });
  const updateMember = useMutation({ mutationFn: ({ id, role, active }) => api.patch(`/recruiter/companies/${selectedId}/members/${id}`, { role, active }), onSuccess: () => members.refetch() });

  function selectCompany(company) {
    setSelectedId(company.id);
    setForm({ ...emptyCompany, ...company, metadata: { ...emptyCompany.metadata, ...(company.metadata || {}), socialLinks: { ...emptyCompany.metadata.socialLinks, ...(company.metadata?.socialLinks || {}) } } });
  }
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); }
  function updateMetadata(key, value) { setForm((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } })); setErrors((current) => ({ ...current, [`metadata.${key}`]: "" })); }
  function submit(event) {
    event.preventDefault();
    try {
      const payload = { ...form, website: normalizeUrl(form.website) || null, officialEmailDomain: normalizeDomain(form.officialEmailDomain) || null, metadata: { ...form.metadata, socialLinks: Object.fromEntries(Object.entries(form.metadata.socialLinks).filter(([, value]) => value).map(([key, value]) => [key, normalizeUrl(value)])) } };
      save.mutate(payload);
    } catch (error) { setErrors({ _form: error.message }); setMessage("Please check the highlighted fields and try again."); }
  }
  useEffect(() => () => { if (logo?.preview) URL.revokeObjectURL(logo.preview); }, [logo]);

  return <div className="max-w-6xl space-y-6">
    <header><p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Company</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Company profile and team</h1></header>
    {(message || errors._form) && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{errors._form || message}</p>}
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4"><button type="button" onClick={() => { setSelectedId(""); setForm(emptyCompany); setLogo(null); setErrors({}); }} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white">Create company</button><div className="mt-4 space-y-2">{companies.data?.map((company) => <button type="button" key={company.id} onClick={() => selectCompany(company)} className={`w-full rounded-xl border px-3 py-3 text-left ${selectedId === company.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><span className="block font-bold text-slate-900">{company.name}</span><span className="mt-1 block text-xs text-slate-500">{company.status}</span></button>)}</div></aside>
      <section className="space-y-6">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{selectedId ? "Edit company" : "New company"}</h2><div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Company name" error={errors.name}><input required value={form.name} onChange={(e) => update("name", e.target.value)} className="input" /></Field>
          <Field label="Official email domain" hint="Example: xyz.com" error={errors.officialEmailDomain}><input value={form.officialEmailDomain} onChange={(e) => update("officialEmailDomain", e.target.value)} className="input" /></Field>
          <Field label="Website" hint="Example: xyz.in" error={errors.website}><input value={form.website} onChange={(e) => update("website", e.target.value)} className="input" /></Field>
          <Field label="Industry"><select value={form.metadata.industry} onChange={(e) => updateMetadata("industry", e.target.value)} className="input"><option value="">Select industry</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Company size"><select value={form.metadata.companySize} onChange={(e) => updateMetadata("companySize", e.target.value)} className="input"><option value="">Select range</option>{sizes.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Headquarters"><input value={form.metadata.headquarters} onChange={(e) => updateMetadata("headquarters", e.target.value)} className="input" /></Field>
          {["linkedin", "x", "careers"].map((key) => <Field key={key} label={`${key === "x" ? "X" : key[0].toUpperCase() + key.slice(1)} link`} error={errors[`metadata.socialLinks.${key}`]}><input value={form.metadata.socialLinks[key]} onChange={(e) => setForm({ ...form, metadata: { ...form.metadata, socialLinks: { ...form.metadata.socialLinks, [key]: e.target.value } } })} className="input" /></Field>)}
          <Field label="Logo upload" hint="PNG, JPG, or WebP up to 2 MB"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; const error = validateLogo(file); if (error) { setErrors({ logo: error }); return; } setErrors({}); setLogo(file ? { file, preview: URL.createObjectURL(file) } : null); }} className="input" />{(logo?.preview || form.logoUrl) && <div className="mt-3 flex items-center gap-3"><img src={logo?.preview || form.logoUrl} alt="Company logo preview" className="size-14 rounded-lg object-cover" /><button type="button" onClick={() => { setLogo(null); update("logoUrl", ""); }} className="text-sm font-bold text-red-600">Remove</button></div>}{errors.logo && <ErrorText>{errors.logo}</ErrorText>}</Field>
          <Field label="Logo URL fallback"><input value={form.logoUrl || ""} onChange={(e) => update("logoUrl", e.target.value)} className="input" /></Field>
          <Field label="Description"><textarea rows="5" value={form.description || ""} onChange={(e) => update("description", e.target.value)} className="input md:col-span-2" /></Field>
        </div><button disabled={save.isPending} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{save.isPending ? "Saving…" : "Save company"}</button></form>
        {selectedId && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Team members</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_200px_auto]"><input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="Recruiter email" className="input" /><select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className="input">{["HIRING_MANAGER", "REVIEWER", "INTERVIEWER", "ANALYST"].map((role) => <option key={role}>{role}</option>)}</select><button type="button" disabled={inviteMember.isPending} onClick={() => inviteMember.mutate()} className="rounded-xl border border-indigo-300 px-4 py-3 font-bold text-indigo-700">Add member</button></div><div className="mt-5 divide-y">{members.data?.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold">{member.user?.fullName || member.user?.email}</p><p className="text-sm text-slate-500">{member.user?.email}</p></div><select value={member.role} onChange={(e) => updateMember.mutate({ id: member.id, role: e.target.value, active: member.active })} className="input w-auto">{["OWNER", "HIRING_MANAGER", "REVIEWER", "INTERVIEWER", "ANALYST"].map((role) => <option key={role}>{role}</option>)}</select><button type="button" onClick={() => updateMember.mutate({ id: member.id, role: member.role, active: false })} className="text-sm font-bold text-red-600">{member.active ? "Remove" : "Inactive"}</button></div>)}</div></section>}
        {selectedId && <Overview company={companies.data?.find((item) => item.id === selectedId) || form} members={members.data || []} />}
      </section>
    </div>
  </div>;
}

function Field({ label, hint, error, children }) { return <label className="text-sm font-semibold text-slate-700">{label}{hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}{children}{error && <ErrorText>{error}</ErrorText>}</label>; }
function ErrorText({ children }) { return <span className="mt-1 block text-xs font-medium text-red-600">{children}</span>; }
function Overview({ company, members }) { return <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6"><div className="flex items-center gap-4"><img src={company.logoUrl || "/logo.svg"} alt="" className="size-16 rounded-xl object-cover" /><div><h2 className="text-xl font-bold">{company.name}</h2><p className="text-sm text-indigo-700">{company.status === "VERIFIED" ? "✓ Verified company" : "Verification pending"}</p></div></div><p className="mt-4 text-sm font-bold text-slate-700">Team members: {members.length}</p></section>; }
