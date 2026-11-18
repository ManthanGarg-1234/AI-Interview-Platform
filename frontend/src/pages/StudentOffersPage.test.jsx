import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentOffersPage from "./StudentOffersPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getApiError: (error) => error?.response?.data?.error?.message || error?.message || "Request failed",
}));

function renderPage(route = "/student/offers") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/student/offers" element={<StudentOffersPage />} />
          <Route path="/student/offers/:id" element={<StudentOffersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sentOffer = {
  id: "offer-1",
  designation: "Software Engineer",
  status: "SENT",
  compensation: { currency: "INR", baseSalary: 1200000 },
  joiningDate: "2027-01-15T00:00:00.000Z",
  expiresAt: "2027-12-15T00:00:00.000Z",
  job: { title: "Backend Engineer", company: { name: "Example Company" } },
};

describe("StudentOffersPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state while offers load", () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading your offers…")).toBeInTheDocument();
  });

  it("shows an empty state for each tab", async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    renderPage();
    for (const label of ["Pending", "Accepted", "Rejected", "Expired"]) {
      await user.click(await screen.findByRole("tab", { name: label }));
      expect(await screen.findByText(`No ${label.toLowerCase()} offers.`)).toBeInTheDocument();
    }
  });

  it("shows an error and retries the offer request", async () => {
    api.get.mockRejectedValueOnce({ response: { data: { error: { message: "Could not load offers" } } } });
    api.get.mockResolvedValueOnce({ data: { data: [] } });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("We couldn’t load your offers.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("shows a confirmation dialog before accepting", async () => {
    api.get.mockImplementation((path) => path === "/me/offers"
      ? Promise.resolve({ data: { data: [sentOffer] } })
      : Promise.resolve({ data: { data: sentOffer } }));
    api.post.mockResolvedValue({ data: { data: { ...sentOffer, status: "ACCEPTED" } } });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage("/student/offers/offer-1");
    await screen.findByRole("heading", { name: "Software Engineer" });
    await user.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(window.confirm).toHaveBeenCalledWith("Are you sure you want to accept this offer?");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows a confirmation and optional reason prompt before rejecting", async () => {
    api.get.mockImplementation((path) => path === "/me/offers"
      ? Promise.resolve({ data: { data: [sentOffer] } })
      : Promise.resolve({ data: { data: sentOffer } }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.spyOn(window, "prompt").mockReturnValue("Accepted elsewhere");
    const user = userEvent.setup();
    renderPage("/student/offers/offer-1");
    await screen.findByRole("heading", { name: "Software Engineer" });
    await user.click(screen.getByRole("button", { name: "Reject offer" }));
    expect(window.confirm).toHaveBeenCalledWith("Are you sure you want to reject this offer?");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows the accepted-offer message and disables accepting another pending offer", async () => {
    api.get.mockImplementation((path) => path === "/me/offers"
      ? Promise.resolve({ data: { data: [{ ...sentOffer, id: "accepted-1", status: "ACCEPTED" }, sentOffer] } })
      : Promise.resolve({ data: { data: sentOffer } }));
    renderPage("/student/offers/offer-1");
    await screen.findByRole("heading", { name: "Software Engineer" });
    expect(screen.getByRole("alert")).toHaveTextContent("You have already accepted an offer");
    expect(screen.getByRole("button", { name: "Accept offer" })).toBeDisabled();
  });
});
