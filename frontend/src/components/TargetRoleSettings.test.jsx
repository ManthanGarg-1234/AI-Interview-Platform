import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TargetRoleSettings from "./TargetRoleSettings";
import { api } from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("target role preferences", () => {
  it("saves a selected role and optional goal date through the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/target-roles") return { data: { data: [{ id: "role-1", slug: "backend-developer", name: "Backend Developer" }] } };
      if (path === "/target-roles/mine") return { data: { data: [] } };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const save = vi.spyOn(api, "post").mockResolvedValue({ data: { data: {} } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <TargetRoleSettings />
      </QueryClientProvider>,
    );

    await user.selectOptions(await screen.findByLabelText("Add a target role"), "backend-developer");
    await user.type(screen.getByLabelText("Goal date (optional)"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Add role" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("/target-roles/mine", {
      roleSlug: "backend-developer",
      goalDate: "2026-12-15",
    }));
  });
});
