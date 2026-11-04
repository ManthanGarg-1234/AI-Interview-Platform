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
  function renderSettings() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TargetRoleSettings />
      </QueryClientProvider>,
    );
  }

  it("saves a selected role and optional goal date through the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/target-roles") return { data: { data: [{ id: "role-1", slug: "backend-developer", name: "Backend Developer" }] } };
      if (path === "/target-roles/mine") return { data: { data: [] } };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const save = vi.spyOn(api, "post").mockResolvedValue({ data: { data: {} } });
    renderSettings();

    await user.selectOptions(await screen.findByLabelText("Add a target role"), "backend-developer");
    await user.type(screen.getByLabelText("Goal date (optional)"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Add role" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith("/target-roles/mine", {
      roleSlug: "backend-developer",
      goalDate: "2026-12-15",
    }));
  });

  it("loads and displays readiness evidence for a selected role", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/target-roles") return { data: { data: [] } };
      if (path === "/target-roles/mine") return { data: { data: [{
        id: "selection-1",
        role: { slug: "backend-developer", name: "Backend Developer" },
      }] } };
      if (path === "/target-roles/mine/backend-developer/readiness") return { data: { data: {
        coverage: { measured: 1, total: 2, percent: 50, definition: "Evidence mapping, not a proficiency score." },
        requiredSkills: [{
          name: "Databases",
          status: "EVIDENCE_AVAILABLE",
          evidence: [{ type: "assessment", label: "Graded assessment evidence: Databases", accuracy: 80, questions: 5 }],
        }],
        coreSubjects: [{ name: "DBMS", status: "NO_ASSESSMENT_EVIDENCE" }],
        dsa: { solvedProblems: 3, byTopic: [{ topic: "Arrays", solved: 3 }], status: "REQUIREMENTS_NOT_CONFIGURED" },
        projects: { profileEntries: 1 },
        evidenceLimits: ["Readiness coverage is not a guarantee of placement or hiring success."],
      } } };
      throw new Error(`Unexpected API request: ${path}`);
    });

    renderSettings();
    await user.click(await screen.findByRole("button", { name: "View readiness report" }));

    expect(await screen.findByText("50% (1/2)")).toBeTruthy();
    expect(screen.getByText("Graded assessment evidence: Databases · 80% across 5 questions")).toBeTruthy();
    expect(screen.getByText(/DSA: 3 solved problems across 1 tagged topics/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/target-roles/mine/backend-developer/readiness");
  });
});
