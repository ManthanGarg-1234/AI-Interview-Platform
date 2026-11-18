import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MentorPage from "./MentorPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MentorPage /></QueryClientProvider>);
}

describe("MentorPage states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state while conversations load", () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading conversations…")).toBeInTheDocument();
  });

  it("shows an error and retry action when conversations fail", async () => {
    api.get.mockRejectedValueOnce({ response: { data: { error: { message: "Could not load mentor" } } } });
    renderPage();
    expect(await screen.findByText("Could not load mentor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
