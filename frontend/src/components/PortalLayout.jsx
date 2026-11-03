import { LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, UserRound, Users, BriefcaseBusiness } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const navigation = {
  STUDENT: [{ label: "Dashboard", to: "/student", icon: LayoutDashboard }, { label: "Profile", to: "/student/profile", icon: UserRound }],
  RECRUITER: [{ label: "Dashboard", to: "/recruiter", icon: LayoutDashboard }, { label: "Jobs", to: "/recruiter/jobs", icon: BriefcaseBusiness }, { label: "Candidates", to: "/recruiter/candidates", icon: Users }],
  ADMIN: [{ label: "Dashboard", to: "/admin", icon: LayoutDashboard }, { label: "Security", to: "/admin/security", icon: ShieldCheck }],
};

export default function PortalLayout({ user, children }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const links = navigation[user.role] || navigation.STUDENT;
  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    navigate("/login", { replace: true });
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className={`fixed inset-y-0 left-0 z-20 w-72 border-r border-slate-200 bg-white p-5 transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link to="/app" className="flex items-center gap-3 px-2 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 font-black text-white">CP</span>
          <span className="font-bold text-slate-950">CareerPrepAI</span>
        </Link>
        <p className="mb-3 mt-8 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">{user.role.toLowerCase()} portal</p>
        <nav className="space-y-1">
          {links.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={18} />{label}</NavLink>)}
          <button onClick={logout} className="mt-8 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700"><LogOut size={18} />Sign out</button>
        </nav>
      </aside>
      <div className="md:pl-72">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur md:px-10">
          <button className="rounded-lg p-2 text-slate-600 md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation"><Menu size={22} /></button>
          <div className="ml-auto flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-bold text-slate-900">{user.name || user.email}</p><p className="text-xs text-slate-500">{user.email}</p></div><div className="grid size-10 place-items-center rounded-full bg-indigo-100 font-bold text-indigo-700">{(user.name || user.email)[0].toUpperCase()}</div><Settings size={18} className="text-slate-400" /></div>
        </header>
        <main className="p-5 md:p-10">{children}</main>
      </div>
    </div>
  );
}
