import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecruiterDashboardPage from "./RecruiterDashboardPage";
import RecruiterAnalyticsPage from "./RecruiterAnalyticsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { get: vi.fn() }, getApiError: () => "Request failed" }));

function renderPage(page) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}>{page}</QueryClientProvider></MemoryRouter>);
}

describe("recruiter dashboard and analytics", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders operational dashboard sections", async () => {
    api.get.mockResolvedValueOnce({ data: { data: { kpis: { openJobs: 2, newApplicants: 3, interviewsToday: 1, offersAwaitingResponse: 0, trends: { openJobs: 1, newApplicants: 2 } }, onboarding: { company: true, job: true, teammate: true, applicants: true }, actionRequired: { applicationsAwaitingReview: [], assessmentsAwaitingReview: [], interviews: [], offersExpiring: [] }, pipeline: [], upcomingInterviews: [], recentActivity: [] } } });
    renderPage(<RecruiterDashboardPage />);
    expect(await screen.findByText("Today’s hiring priorities")).toBeInTheDocument();
    expect(screen.getByText("Action required")).toBeInTheDocument();
    expect(screen.getByText("Pipeline snapshot")).toBeInTheDocument();
  });
  it("renders historical analytics separately", async () => {
    api.get.mockImplementation((path) => path === "/recruiter/jobs" ? Promise.resolve({ data: { data: [] } }) : Promise.resolve({ data: { data: { perJob: [], funnel: [], scoreDistribution: [], metrics: { timeToHireDays: null, offerAcceptanceRate: null, assessmentPassRate: null, interviewToOfferRatio: null } } } }));
    renderPage(<RecruiterAnalyticsPage />);
    expect(await screen.findByText("Hiring performance", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("No hiring data for this date range.")).toBeInTheDocument();
  });
  it("renders real empty dashboard states instead of placeholder metrics", async () => {
    api.get.mockResolvedValueOnce({ data: { data: { kpis: { openJobs: 0, newApplicants: 0, interviewsToday: 0, offersAwaitingResponse: 0, trends: { openJobs: 0, newApplicants: 0 } }, onboarding: { company: true, job: true, teammate: true, applicants: true }, actionRequired: { applicationsAwaitingReview: [], assessmentsAwaitingReview: [], interviews: [], offersExpiring: [] }, pipeline: [], upcomingInterviews: [], recentActivity: [] } } });
    renderPage(<RecruiterDashboardPage />);
    expect(await screen.findByText("No interviews scheduled in the next 7 days.")).toBeInTheDocument();
    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
  });
});
