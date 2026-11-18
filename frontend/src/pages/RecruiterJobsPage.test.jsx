import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecruiterJobsPage from "./RecruiterJobsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><RecruiterJobsPage /></QueryClientProvider>);
}

describe("RecruiterJobsPage edit form", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefills and submits validated job edits", async () => {
    api.get.mockImplementation((path) => path === "/recruiter/jobs"
      ? Promise.resolve({ data: { data: [{ id: "job-1", companyId: "company-1", company: { name: "Example" }, title: "Engineer", description: "A sufficiently detailed job description.", employmentType: "FULL_TIME", status: "DRAFT", location: "Remote", metadata: {}, skills: [], _count: { applications: 2 } }] } })
      : Promise.resolve({ data: { data: [{ id: "company-1", name: "Example" }] } }));
    api.patch.mockResolvedValue({ data: { data: { id: "job-1" } } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit job" })).toBeInTheDocument();
    const title = screen.getByRole("textbox", { name: "Job title" });
    expect(title).toHaveValue("Engineer");
    await user.clear(title);
    await user.type(title, "Senior Engineer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api.patch).toHaveBeenCalledWith("/recruiter/jobs/job-1", expect.objectContaining({ title: "Senior Engineer" }));
  }, 15000);
});
