import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentProfilePage from "./StudentProfilePage";
import { api } from "../lib/api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("StudentProfilePage", () => {
  it("loads authenticated profile sections, saves edits, and uses responsive section layouts", async () => {
    const profile = { firstName: "Ada", lastName: "Lovelace", phone: "", location: "London", headline: "Engineer", bio: "", githubUrl: null, linkedinUrl: null, portfolioUrl: null, discoverable: false, user: { profileImageUrl: null } };
    vi.spyOn(api, "get").mockImplementation(async (path) => ({ data: { data: path === "/me/profile" ? profile : [] } }));
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { data: profile } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={queryClient}><MemoryRouter><StudentProfilePage /></MemoryRouter></QueryClientProvider>);

    const firstName = await screen.findByLabelText("First name");
    expect(screen.getByRole("heading", { name: "Build your career profile" })).toBeTruthy();
    expect(screen.getByLabelText("Profile picture URL (HTTPS)")).toBeTruthy();
    expect(container.querySelector(".lg\\:grid-cols-2")).toBeTruthy();
    fireEvent.change(firstName, { target: { value: "Augusta" } });
    fireEvent.click(screen.getByRole("button", { name: "Save personal information" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/me/profile", expect.objectContaining({ firstName: "Augusta" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved.");
  });
});
