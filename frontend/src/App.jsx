import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PortalLayout from "./components/PortalLayout";
import StudentProfilePage from "./pages/StudentProfilePage";
import ResumeAnalysisPage from "./pages/ResumeAnalysisPage";

function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await api.get("/auth/me")).data.data,
    retry: false,
  });
}

function ProtectedRoute({ children, roles }) {
  const user = useCurrentUser();
  if (user.isLoading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading your workspace…</div>;
  if (user.isError) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.data.role)) return <Navigate to="/app" replace />;
  return children;
}

function Dashboard({ user }) {
  const labels = {
    STUDENT: ["Student workspace", "Build evidence for your next opportunity."],
    RECRUITER: ["Recruiter workspace", "Move qualified candidates through a fair hiring workflow."],
    ADMIN: ["Admin governance", "Monitor platform health, access, and security events."],
  };
  const [title, subtitle] = labels[user.role] || labels.STUDENT;
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">{user.role}</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">{title}</h1>
      <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {["Profile readiness", "Active workflow", "Recent activity"].map((item, index) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={item}>
            <p className="text-sm text-slate-500">{item}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{index === 0 ? "Getting started" : "No activity yet"}</p>
            <p className="mt-2 text-sm text-slate-500">Connect the next step from your navigation.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppRoutes() {
  const { data: user } = useCurrentUser();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
      <Route path="/app" element={<ProtectedRoute><PortalLayout user={user}><Dashboard user={user} /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentProfilePage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/resume-analysis" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ResumeAnalysisPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/*" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><Dashboard user={user} /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/*" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><Dashboard user={user} /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><Dashboard user={user} /></PortalLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? "/app" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() { return <AppRoutes />; }
