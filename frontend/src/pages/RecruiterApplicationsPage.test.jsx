import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecruiterApplicationsPage from "./RecruiterApplicationsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><RecruiterApplicationsPage /></QueryClientProvider>);
}

describe("RecruiterApplicationsPage Kanban", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rolls back an optimistic stage move when the API fails", async () => {
    api.get.mockImplementation((path) => path === "/recruiter/applications"
      ? Promise.resolve({ data: { data: [{ id: "application-1", status: "APPLIED", appliedAt: "2026-11-18T00:00:00.000Z", student: { fullName: "Taylor Student", email: "taylor@example.test" }, job: { title: "Backend Engineer" } }] } })
      : Promise.reject(new Error("Unexpected")));
    api.patch.mockRejectedValue({ response: { data: { error: { message: "Invalid stage transition" } } } });
    const user = userEvent.setup();
    renderPage();

    const fallback = await screen.findByRole("combobox", { name: "Move Taylor Student stage" });
    expect(fallback).toHaveValue("APPLIED");
    await user.selectOptions(fallback, "SCREENING");
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/recruiter/applications/application-1/status", { status: "SCREENING" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Move Taylor Student stage" })).toHaveValue("APPLIED"));
  });
});
