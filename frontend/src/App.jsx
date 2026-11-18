import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PortalLayout from "./components/PortalLayout";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentDashboardPage from "./pages/StudentDashboardPage";
import SubjectsPage from "./pages/SubjectsPage";
import SubjectDetailPage from "./pages/SubjectDetailPage";
import TopicLearningPage from "./pages/TopicLearningPage";
import ResumeAnalysisPage from "./pages/ResumeAnalysisPage";
import CodingPracticePage from "./pages/CodingPracticePage";
import CodingProblemPage from "./pages/CodingProblemPage";
import InterviewDashboardPage from "./pages/InterviewDashboardPage";
import InterviewSetupPage from "./pages/InterviewSetupPage";
import InterviewRoomPage from "./pages/InterviewRoomPage";
import InterviewHistoryPage from "./pages/InterviewHistoryPage";
import InterviewResultsPage from "./pages/InterviewResultsPage";
import AssessmentDashboardPage from "./pages/AssessmentDashboardPage";
import AssessmentInstructionsPage from "./pages/AssessmentInstructionsPage";
import ActiveAssessmentPage from "./pages/ActiveAssessmentPage";
import AssessmentResultPage from "./pages/AssessmentResultPage";
import PerformanceDashboardPage from "./pages/PerformanceDashboardPage";
import LearningPlannerPage from "./pages/LearningPlannerPage";
import MentorPage from "./pages/MentorPage";
import ResourceLibraryPage from "./pages/ResourceLibraryPage";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationPreferencesPage from "./pages/NotificationPreferencesPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import RecruiterDashboardPage from "./pages/RecruiterDashboardPage";
import JobsPage from "./pages/JobsPage";
import RecruiterJobsPage from "./pages/RecruiterJobsPage";
import RecruiterAssessmentsPage from "./pages/RecruiterAssessmentsPage";
import RecruiterAssessmentReviewsPage from "./pages/RecruiterAssessmentReviewsPage";
import JobDetailPage from "./pages/JobDetailPage";
import ContestsPage from "./pages/ContestsPage";
import ContestWorkspacePage from "./pages/ContestWorkspacePage";
import RecruiterInterviewsPage from "./pages/RecruiterInterviewsPage";
import StudentInterviewsPage from "./pages/StudentInterviewsPage";
import InterviewerWorkspacePage from "./pages/InterviewerWorkspacePage";
import RecruiterLiveInterviewPage from "./pages/RecruiterLiveInterviewPage";
import RecruiterCandidatesPage from "./pages/RecruiterCandidatesPage";
import AdminTargetRolesPage from "./pages/AdminTargetRolesPage";
import DSASheetsPage from "./pages/DSASheetsPage";
import AdminDSASheetsPage from "./pages/AdminDSASheetsPage";

function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await api.get("/auth/me")).data.data,
    retry: false,
  });
}

function homePathForRole(role) {
  return ({ STUDENT: "/student", RECRUITER: "/recruiter", ADMIN: "/admin" })[role] || "/login";
}

function RoleHome() {
  const { data: user } = useCurrentUser();
  return <Navigate to={homePathForRole(user?.role)} replace />;
}

function ProtectedRoute({ children, roles }) {
  const user = useCurrentUser();
  if (user.isLoading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading your workspace…</div>;
  if (user.isError || !user.data) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.data.role)) return <Navigate to={homePathForRole(user.data.role)} replace />;
  return children;
}

function AppRoutes() {
  const { data: user } = useCurrentUser();

  const portal = (children) => <PortalLayout user={user}>{children}</PortalLayout>;
  const student = (children, roles = ["STUDENT"]) => (
    <ProtectedRoute roles={roles}>{portal(children)}</ProtectedRoute>
  );

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />

      {/* Root redirect */}
      <Route path="/app" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />

      {/* Student routes — specific routes MUST come before the wildcard */}
      <Route path="/student" element={student(<StudentDashboardPage />)} />
      <Route path="/student/profile" element={student(<StudentProfilePage />)} />
      <Route path="/student/jobs" element={student(<JobsPage />)} />
      <Route path="/student/jobs/:id" element={student(<JobDetailPage />)} />
      <Route path="/student/resume-analysis" element={student(<ResumeAnalysisPage />)} />
      <Route path="/student/coding" element={student(<CodingPracticePage />)} />
      <Route path="/student/coding/:slug" element={student(<CodingProblemPage />)} />
      <Route path="/student/dsa-sheets" element={student(<DSASheetsPage />)} />
      <Route path="/student/dsa-sheets/:slug" element={student(<DSASheetsPage />)} />
      <Route path="/student/contests" element={student(<ContestsPage />)} />
      <Route path="/student/contests/:id" element={student(<ContestWorkspacePage />)} />
      <Route path="/student/interviews/new" element={student(<InterviewSetupPage />)} />
      <Route path="/student/interviews/history" element={student(<InterviewHistoryPage />)} />
      <Route path="/student/interviews/:id/room" element={student(<InterviewRoomPage />)} />
      <Route path="/student/interviews/:id" element={student(<InterviewResultsPage />)} />
      <Route path="/student/interviews" element={student(<InterviewDashboardPage />)} />
      <Route path="/student/recruiter-interviews" element={student(<StudentInterviewsPage />)} />
      <Route path="/student/analytics" element={student(<PerformanceDashboardPage />)} />
      <Route path="/student/planner" element={student(<LearningPlannerPage />)} />
      <Route path="/student/mentor" element={student(<MentorPage />)} />
      <Route path="/student/resources" element={student(<ResourceLibraryPage />)} />
      {/* Phase 19 — Subjects */}
      <Route path="/student/subjects" element={student(<SubjectsPage />)} />
      <Route path="/student/subjects/:slug/topics/:topicSlug" element={student(<TopicLearningPage />)} />
      <Route path="/student/subjects/:slug" element={student(<SubjectDetailPage />)} />
      {/* Assessment routes — most specific first */}
      <Route path="/student/assessments/attempts/:id" element={student(<ActiveAssessmentPage />)} />
      <Route path="/student/assessments/results/:id" element={student(<AssessmentResultPage />)} />
      <Route path="/student/assessments/:id" element={student(<AssessmentInstructionsPage />)} />
      <Route path="/student/assessments" element={student(<AssessmentDashboardPage />)} />
      {/* Student wildcard — catches any unmatched /student/* */}
      <Route path="/student/*" element={student(<StudentDashboardPage />)} />

      {/* Shared interview room (student + recruiter) */}
      <Route path="/interviews/:id/workspace" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<InterviewerWorkspacePage />)}</ProtectedRoute>} />
      <Route path="/interviews/:id/live" element={<ProtectedRoute roles={["STUDENT", "RECRUITER"]}>{portal(<RecruiterLiveInterviewPage />)}</ProtectedRoute>} />

      {/* Notifications (all authenticated roles) */}
      <Route path="/notifications" element={<ProtectedRoute>{portal(<NotificationsPage />)}</ProtectedRoute>} />
      <Route path="/notification-preferences" element={<ProtectedRoute>{portal(<NotificationPreferencesPage />)}</ProtectedRoute>} />

      {/* Recruiter routes */}
      <Route path="/recruiter" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterDashboardPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/jobs" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterJobsPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/interviews" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterInterviewsPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/assessments" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterAssessmentsPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/assessments/:id/reviews" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterAssessmentReviewsPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/candidates" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterCandidatesPage />)}</ProtectedRoute>} />
      <Route path="/recruiter/*" element={<ProtectedRoute roles={["RECRUITER"]}>{portal(<RecruiterDashboardPage />)}</ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin/target-roles" element={<ProtectedRoute roles={["ADMIN"]}>{portal(<AdminTargetRolesPage />)}</ProtectedRoute>} />
      <Route path="/admin/dsa-sheets" element={<ProtectedRoute roles={["ADMIN"]}>{portal(<AdminDSASheetsPage />)}</ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute roles={["ADMIN"]}>{portal(<AdminDashboardPage />)}</ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() { return <AppRoutes />; }
