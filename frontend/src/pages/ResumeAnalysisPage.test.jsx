import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResumeAnalysisPage from "./ResumeAnalysisPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ResumeAnalysisPage /></QueryClientProvider>);
}

describe("ResumeAnalysisPage states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading skeletons while resume and analysis history load", () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/drop or choose/i)).toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows an error and retry action when history fails", async () => {
    api.get.mockImplementation((path) => path === "/me/resumes"
      ? Promise.resolve({ data: { data: [] } })
      : Promise.reject({ response: { data: { error: { message: "Could not load history" } } } }));
    renderPage();
    expect(await screen.findByText("Could not load history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("submits only a job description without sending an empty target role", async () => {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (path === "/me/resumes") return Promise.resolve({
        data: { data: [{ id: "resume-1", title: "My resume", versions: [{ id: "550e8400-e29b-41d4-a716-446655440000", version: 1, file: { scanStatus: "CLEAN" } }] }] },
      });
      return Promise.resolve({ data: { data: [] } });
    });
    api.post.mockResolvedValue({ data: { data: { id: "analysis-1", status: "PENDING" } } });
    renderPage();
    await screen.findByRole("option", { name: /My resume/ });
    await user.selectOptions(screen.getByLabelText("Resume version"), "550e8400-e29b-41d4-a716-446655440000");
    await user.type(screen.getByLabelText("Job description (optional)"), "TypeScript Node.js");
    await user.click(screen.getByRole("button", { name: "Analyze resume" }));
    expect(api.post).toHaveBeenCalledWith("/me/resume-analyses", {
      resumeVersionId: "550e8400-e29b-41d4-a716-446655440000",
      jobDescription: "TypeScript Node.js",
    });
  });
});
