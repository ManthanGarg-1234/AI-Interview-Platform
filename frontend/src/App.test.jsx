import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { api } from "./lib/api";
import { homePathForRole } from "./lib/routes";

vi.mock("./lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

describe("frontend foundation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has a test runner configured", () => {
    expect(true).toBe(true);
  });

  it("sends authenticated users to the dashboard for their role", () => {
    expect(homePathForRole("ADMIN")).toBe("/admin");
    expect(homePathForRole("RECRUITER")).toBe("/recruiter");
    expect(homePathForRole("STUDENT")).toBe("/student");
    expect(homePathForRole("UNKNOWN")).toBe("/login");
  });

  it("renders the public landing page and switches themes", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /turn your potential into your next opportunity/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start preparing/i })).toHaveAttribute("href", "/register");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(await screen.findByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    queryClient.clear();
  });

  it("requests password recovery without exposing whether an account exists", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({ data: { message: "If an eligible account exists, reset instructions will be sent if email delivery is available." } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/forgot-password"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "candidate@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(api.post).toHaveBeenCalledWith("/auth/password-reset/request", { email: "candidate@example.test" });
    expect(await screen.findByRole("status")).toHaveTextContent("If an eligible account exists");
    queryClient.clear();
  });

  it("submits registration confirmation and consent, then waits for email verification", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: { data: { email: "student@example.test", role: "STUDENT" } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/register"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Full name"), "Taylor Student");
    await user.type(screen.getByLabelText("Email"), "student@example.test");
    await user.type(screen.getByLabelText("Password"), "Valid-Passphrase-2030!");
    await user.type(screen.getByLabelText("Confirm password"), "Valid-Passphrase-2030!");
    expect(screen.getByRole("button", { name: "Create account with Google" })).toBeDisabled();
    await user.click(screen.getByLabelText("I accept the CareerPrepAI Terms of Service."));
    await user.click(screen.getByLabelText("I acknowledge the CareerPrepAI Privacy Policy."));
    expect(screen.getByRole("button", { name: "Create account with Google" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/register", {
      name: "Taylor Student",
      email: "student@example.test",
      password: "Valid-Passphrase-2030!",
      confirmPassword: "Valid-Passphrase-2030!",
      role: "STUDENT",
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/verify your email before signing in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    queryClient.clear();
  });

  it("explains Google email collisions without silently linking accounts", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/login?oauth=link-required"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Google was not linked automatically");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    queryClient.clear();
  });

  it("submits verification-link tokens from the URL fragment", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.post.mockResolvedValueOnce({ data: { data: { verified: true } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/verify-email#token=one-time-verification-token"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/verify-email", { token: "one-time-verification-token" }));
    expect(await screen.findByText("Email verified. You can now sign in.")).toBeInTheDocument();
    queryClient.clear();
  });

  it("submits a new password with the reset token from the URL fragment", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({});
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/reset-password#token=one-time-reset-token"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("New password"), "Valid-Reset-Passphrase-2030!");
    await user.type(screen.getByLabelText("Confirm new password"), "Valid-Reset-Passphrase-2030!");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/password-reset/confirm", {
      token: "one-time-reset-token",
      password: "Valid-Reset-Passphrase-2030!",
      confirmPassword: "Valid-Reset-Passphrase-2030!",
    }));
    expect(await screen.findByText("Your password has been updated. Sign in with your new password.")).toBeInTheDocument();
    queryClient.clear();
  });

  it("shows placement sheets and tracks progress while keeping practice external", async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValue({ data: { data: { status: "SOLVED" } } });
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "student-1", email: "student@example.test", name: "Student", role: "STUDENT" } } });
      }
      if (path === "/coding/library/progress/summary") {
        return Promise.resolve({ data: { data: { totals: { total: 1, attempted: 0, solved: 0, revisionRequired: 0, remaining: 1, completionPercent: 0 } } } });
      }
      if (path === "/coding/library/sheets") {
        return Promise.resolve({
          data: {
            data: {
              items: [{
                id: "sheet-1",
                slug: "interview-fundamentals",
                name: "Interview Fundamentals",
                description: "Curated practice",
                source: "LeetCode",
                category: "DSA",
                totalProblems: 1,
                topicCount: 1,
                solved: 0,
                completionPercent: 0,
                status: "NOT_STARTED",
              }],
              page: 1,
              pages: 1,
              total: 1,
            },
          },
        });
      }
      if (path === "/coding/library/sheets/interview-fundamentals") {
        return Promise.resolve({ data: { data: {
          sheet: { id: "sheet-1", slug: "interview-fundamentals", name: "Interview Fundamentals", description: "Curated practice", source: "LeetCode", category: "DSA" },
          items: [{ id: "problem-1", slug: "two-sum", title: "Two Sum", difficulty: "EASY", platform: "LEETCODE", url: "https://leetcode.com/problems/two-sum/", verifiedAt: new Date().toISOString(), progress: { status: "NOT_STARTED", attempts: 0 }, bookmarked: false, sheetOrder: 1, sheetTopic: { name: "Arrays" } }],
          page: 1,
          pages: 1,
          total: 1,
        } } });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Placement problem library" })).toBeInTheDocument();
    await user.click(await screen.findByRole("link", { name: /Interview Fundamentals/ }));
    const externalProblemLink = await screen.findByRole("link", { name: /Solve externally/ });
    expect(externalProblemLink).toHaveAttribute("href", "https://leetcode.com/problems/two-sum/");
    expect(externalProblemLink).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("combobox", { name: "Progress for Two Sum" })).toHaveValue("NOT_STARTED");
    expect(api.get).toHaveBeenCalledWith("/coding/library/sheets", expect.objectContaining({ params: expect.objectContaining({ page: 1, pageSize: 12 }) }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Progress for Two Sum" }), "SOLVED");
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/coding/library/problems/problem-1/progress", { status: "SOLVED" }));
    expect(api.get).not.toHaveBeenCalledWith("/coding/problems");
    queryClient.clear();
  });

  it("renders the student dashboard from persisted API metrics", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "student-1", email: "student@example.test", name: "Student", role: "STUDENT" } } });
      }
      if (path === "/me/dashboard") {
        return Promise.resolve({ data: { data: {
          profile: { name: "Student", completionPercent: 70 },
          resume: { count: 1, latestScore: 82 },
          interviews: { completed: 2, averageScore: 76 },
          applications: { recent: [], statusCounts: { APPLIED: 3 } },
          upcomingInterviews: [],
          assessments: { upcoming: [] },
          studyPlan: { activePlans: 1, completedTasks: 2, totalTasks: 4 },
          notifications: { unread: 1 },
          weeklyActivity: Array.from({ length: 7 }, (_, index) => ({ date: `2026-11-${String(index + 11).padStart(2, "0")}`, count: index === 6 ? 1 : 0 })),
          recentActivity: [],
          recommendations: [],
        } } });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/dashboard"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Welcome back, Student" })).toBeInTheDocument();
    expect(screen.getByText(/Latest estimated score: 82\/100/)).toBeInTheDocument();
    expect(screen.getByText("APPLIED · 3")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/me/dashboard");
    queryClient.clear();
  });

  it("renders performance from recorded data and reloads the selected date range", async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "student-1", email: "student@example.test", name: "Student", role: "STUDENT" } } });
      }
      if (path === "/me/performance") {
        return Promise.resolve({ data: { data: {
          resume: { latestScore: 82 },
          coding: { solved: 1, inProgress: 0, byDifficulty: { EASY: 1 } },
          interviews: { averageScore: 76 },
          assessments: { accuracy: 80, correct: 4, questions: 5 },
          activities: [{ id: "activity-1", type: "PRACTICE_COMPLETED", occurredAt: new Date().toISOString(), topic: "Arrays" }],
          skills: [],
        } } });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/analytics"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Your preparation dashboard" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Recorded activity for the last 30 days" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Activity date range"), "7");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/me/performance", { params: { range: "7" } }));
    expect(screen.getByRole("img", { name: "Recorded activity for the last 7 days" })).toBeInTheDocument();
    queryClient.clear();
  });

  it("creates a study plan through the persisted planner API", async () => {
    const user = userEvent.setup();
    let plans = [];
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "student-1", email: "student@example.test", name: "Student", role: "STUDENT" } } });
      }
      if (path === "/me/plans") return Promise.resolve({ data: { data: plans } });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    api.post.mockImplementation((path, body) => {
      if (path !== "/me/plans") return Promise.reject(new Error(`Unexpected request: ${path}`));
      plans = [{ id: "plan-1", targetRole: body.targetRole, dailyMinutes: body.dailyMinutes, deadline: null, goals: [], tasks: [] }];
      return Promise.resolve({ data: { data: plans[0] } });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/planner"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Personalized learning planner" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Target role"), "Backend Engineer");
    await user.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/plans", {
      targetRole: "Backend Engineer",
      dailyMinutes: 60,
      deadline: undefined,
      goals: [],
    }));
    expect(await screen.findByRole("heading", { name: "Backend Engineer" })).toBeInTheDocument();
    queryClient.clear();
  });

  it("keeps the portal open and reports a failed server logout", async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (path === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "admin-1", email: "admin@example.test", name: "Admin", role: "ADMIN" } } });
      }
      if (path === "/admin/security-events") return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    api.post.mockRejectedValueOnce(new Error("Server unavailable"));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/security"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Security events" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Could not sign out. Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security events" })).toBeInTheDocument();
    queryClient.clear();
  });

  it.each([
    {
      path: "/recruiter/candidates",
      role: "RECRUITER",
      endpoint: "/recruiter/candidates",
      args: ["/recruiter/candidates", { params: { q: undefined, page: 1 } }],
      response: { items: [], pages: 0 },
      heading: "Candidates",
    },
    {
      path: "/admin/security",
      role: "ADMIN",
      endpoint: "/admin/security-events",
      args: ["/admin/security-events"],
      response: [],
      heading: "Security events",
    },
  ])("opens the $heading sidebar page", async ({ path, role, endpoint, args, response, heading }) => {
    api.get.mockImplementation((requestPath) => {
      if (requestPath === "/auth/me") {
        return Promise.resolve({ data: { data: { id: "user-1", email: "user@example.test", name: "User", role } } });
      }
      if (requestPath === endpoint) return Promise.resolve({ data: { data: response } });
      return Promise.reject(new Error(`Unexpected request: ${requestPath}`));
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(...args);
    queryClient.clear();
  });
});
