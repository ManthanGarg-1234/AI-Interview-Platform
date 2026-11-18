import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RecruiterCompanyPage from "./RecruiterCompanyPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(() => Promise.resolve({ data: { data: [] } })), post: vi.fn(() => Promise.reject({ response: { data: { error: { message: "{\"issues\":[{\"path\":[\"website\"]}]}" } } } })), patch: vi.fn() },
  getApiError: () => "Please check the highlighted fields and try again.",
  mapApiValidationError: () => ({ summary: "Please check the highlighted fields and try again.", fieldErrors: { website: "Enter a valid website, like https://example.com" } }),
}));

it("does not render raw validation JSON in a recruiter form", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><RecruiterCompanyPage /></QueryClientProvider>);
  await user.type(await screen.findByLabelText("Company name"), "Example");
  await user.click(screen.getByRole("button", { name: "Save company" }));
  expect(screen.queryByText(/\{\\"issues\\"/)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields");
  expect(api.post).toHaveBeenCalled();
});
