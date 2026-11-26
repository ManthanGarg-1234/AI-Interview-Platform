import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboardPage from "./StudentDashboardPage";
import { api } from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudentDashboardPage", () => {
  it("renders current dashboard API data and real empty states", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        data: {
          profile: { name: "Ada Lovelace", headline: "Software engineer", completionPercent: 70 },
          student: { name: "Ada Lovelace", headline: "Software engineer", profileCompletion: 70 },
          overview: {
            codingSolved: 4,
            interviewsCompleted: 2,
            avgInterviewScore: 75,
            problemsAttempted: 6,
            applicationsTotal: 3,
          },
          upcomingInterviews: [],
          studyPlan: { activePlans: 0, completedTasks: 0, totalTasks: 0, tasks: [] },
          dailyStudy: { streakDays: 2, trackedMinutes: 25, goalMinutes: 40, completedTasks: 1 },
          readiness: { score: null, status: "NOT_CALCULATED", calculatedAt: null },
          preparation: { weakTopics: [{ id: "topic-1", name: "Joins", subject: "DBMS", percent: 20 }] },
          resume: { count: 1, latest: { id: "resume-1", title: "Resume", scanStatus: "CLEAN", version: 2 } },
          timeline: [],
          subjects: [],
          upcoming: { interviews: [] },
        },
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudentDashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Ada/ })).toBeTruthy();
    expect(screen.getByText("Applications")).toBeTruthy();
    expect(screen.getByText("Problems solved")).toBeTruthy();
    expect(screen.getByText("2 days")).toBeTruthy();
    expect(screen.getByText("25 min")).toBeTruthy();
    expect(screen.getByText("Not calculated")).toBeTruthy();
    expect(screen.getByText(/Joins/)).toBeTruthy();
    expect(screen.getByText(/CLEAN · version 2/)).toBeTruthy();
    expect(await screen.findByText("No activity yet")).toBeTruthy();
    expect(screen.getByText("No subjects started")).toBeTruthy();
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
  });
});
