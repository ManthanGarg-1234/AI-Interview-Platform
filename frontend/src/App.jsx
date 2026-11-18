import { Navigate, Route, Routes } from "react-router-dom";
import { homePathForRole } from "./lib/routes";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import AppErrorBoundary from "./components/AppErrorBoundary";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LandingPage from "./pages/LandingPage";
import PortalLayout from "./components/PortalLayout";
import StudentProfilePage from "./pages/StudentProfilePage";
import StudentDashboardPage from "./pages/StudentDashboardPage";
import ResumeAnalysisPage from "./pages/ResumeAnalysisPage";
import CodingPracticePage from "./pages/CodingPracticePage";
import CodingSheetPage from "./pages/CodingSheetPage";
import CodingProblemDetailPage from "./pages/CodingProblemDetailPage";
import CodingProgressPage from "./pages/CodingProgressPage";
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
import AdminSecurityPage from "./pages/AdminSecurityPage";
import AdminCodingLibraryPage from "./pages/AdminCodingLibraryPage";
import RecruiterDashboardPage from "./pages/RecruiterDashboardPage";
import RecruiterCandidatesPage from "./pages/RecruiterCandidatesPage";
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
import RecruiterCompanyPage from "./pages/RecruiterCompanyPage";
import RecruiterApplicationsPage from "./pages/RecruiterApplicationsPage";
import RecruiterOffersPage from "./pages/RecruiterOffersPage";
import RecruiterAnalyticsPage from "./pages/RecruiterAnalyticsPage";
import StudentOffersPage from "./pages/StudentOffersPage";

function ProtectedRoute({ children, roles }) {
  const { user, isLoading, error } = useAuth();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-slate-500">Loading your workspace…</div>;
  if (error || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathForRole(user.role)} replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/app" element={<ProtectedRoute><Navigate to={homePathForRole(user?.role)} replace /></ProtectedRoute>} />
      <Route path="/student" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/dashboard" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentProfilePage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/jobs" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><JobsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/jobs/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><JobDetailPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/offers" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentOffersPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/offers/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentOffersPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/resume-analysis" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ResumeAnalysisPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/coding" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><CodingPracticePage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/coding/sheets/:slug" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><CodingSheetPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/coding/problems/:slug" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><CodingProblemDetailPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/coding/progress" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><CodingProgressPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/contests" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ContestsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/contests/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ContestWorkspacePage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/interviews" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><InterviewDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/recruiter-interviews" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><StudentInterviewsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/interviews/:id/room" element={<ProtectedRoute roles={["STUDENT", "RECRUITER"]}><PortalLayout user={user}><RecruiterLiveInterviewPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/interviews/:id/workspace" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><InterviewerWorkspacePage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/interviews/new" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><InterviewSetupPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/interviews/history" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><InterviewHistoryPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/interviews/:id/room" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><InterviewRoomPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/interviews/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><InterviewResultsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/analytics" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><PerformanceDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/planner" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><LearningPlannerPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/mentor" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><MentorPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/resources" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ResourceLibraryPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><PortalLayout user={user}><NotificationsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/notification-preferences" element={<ProtectedRoute><PortalLayout user={user}><NotificationPreferencesPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/assessments" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><AssessmentDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/assessments/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><AssessmentInstructionsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/assessments/attempts/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><ActiveAssessmentPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/assessments/results/:id" element={<ProtectedRoute roles={["STUDENT"]}><PortalLayout user={user}><AssessmentResultPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/student/*" element={<ProtectedRoute roles={["STUDENT"]}><Navigate to="/student/dashboard" replace /></ProtectedRoute>} />
      <Route path="/recruiter/*" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/jobs" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterJobsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/company" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterCompanyPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/applications" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterApplicationsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/offers" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterOffersPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/analytics" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterAnalyticsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/interviews" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterInterviewsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/assessments" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterAssessmentsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/assessments/:id/reviews" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterAssessmentReviewsPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/candidates" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterCandidatesPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin/security" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><AdminSecurityPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin/coding-library" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><AdminCodingLibraryPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/recruiter/dashboard" element={<ProtectedRoute roles={["RECRUITER"]}><PortalLayout user={user}><RecruiterDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><AdminDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><AdminDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute roles={["ADMIN"]}><PortalLayout user={user}><AdminDashboardPage /></PortalLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? "/app" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
