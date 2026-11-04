import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Code2,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const navigation = {
  STUDENT: [
    { label: "Dashboard", to: "/student", icon: LayoutDashboard, end: true },
    { label: "Job opportunities", to: "/student/jobs", icon: BriefcaseBusiness },
    { label: "Performance", to: "/student/analytics", icon: BarChart3 },
    { label: "Study planner", to: "/student/planner", icon: CalendarDays },
    { label: "AI mentor", to: "/student/mentor", icon: Bot },
    { label: "Resources", to: "/student/resources", icon: Library },
    { label: "Notifications", to: "/notifications", icon: Bell, badge: true },
    { label: "Profile", to: "/student/profile", icon: UserRound },
    { label: "Resume analysis", to: "/student/resume-analysis", icon: BriefcaseBusiness },
    { label: "Coding practice", to: "/student/coding", icon: Code2 },
    { label: "Contests", to: "/student/contests", icon: Trophy },
    { label: "AI interviews", to: "/student/interviews", icon: MessageSquare },
    { label: "Recruiter interviews", to: "/student/recruiter-interviews", icon: CalendarDays },
    { label: "Assessments", to: "/student/assessments", icon: ClipboardCheck },
  ],
  RECRUITER: [
    { label: "Dashboard", to: "/recruiter", icon: LayoutDashboard, end: true },
    { label: "Jobs", to: "/recruiter/jobs", icon: BriefcaseBusiness },
    { label: "Interviews", to: "/recruiter/interviews", icon: CalendarDays },
    { label: "Assessments", to: "/recruiter/assessments", icon: ClipboardCheck },
    { label: "Candidates", to: "/recruiter/candidates", icon: Users },
  ],
  ADMIN: [
    { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
    { label: "Security", to: "/admin/security", icon: ShieldCheck },
  ],
};

function useUnreadCount(enabled) {
  return useQuery({
    queryKey: ["notification-count"],
    queryFn: async () => {
      const res = await api.get("/me/notifications", { params: { limit: 1 } });
      return res.data.data.unread;
    },
    enabled,
    refetchInterval: 60000, // refresh every minute
    staleTime: 30000,
  });
}

export default function PortalLayout({ user, children }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const links = navigation[user?.role] || navigation.STUDENT;
  const isStudent = user?.role === "STUDENT";
  const { data: unreadCount } = useUnreadCount(isStudent);

  // Close sidebar on route change (mobile)
  useEffect(() => { setOpen(false); }, []);

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-10 bg-slate-900/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <Link to="/student" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">
              CP
            </span>
            <span className="font-bold text-slate-950">CareerPrepAI</span>
          </Link>
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Role label */}
        <p className="mx-5 mt-5 mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          {user?.role?.toLowerCase()} portal
        </p>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
          {links.map(({ label, to, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <Icon size={17} className="shrink-0" />
              <span className="flex-1 leading-none">{label}</span>
              {badge && isStudent && unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-0.5">
          <NavLink
            to="/notification-preferences"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50"
              }`
            }
          >
            <Settings size={17} className="shrink-0" />
            Preferences
          </NavLink>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <LogOut size={17} className="shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-72">
        {/* Top header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Notification bell shortcut */}
            {isStudent && (
              <Link
                to="/notifications"
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-2 ring-white" />
                )}
              </Link>
            )}

            {/* User info */}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {(user?.name || user?.email || "?")[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
