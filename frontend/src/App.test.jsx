import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { api } from "./lib/api";

function renderApp(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("application routes", () => {
  it.each([
    ["/login", "Welcome back"],
    ["/register", "Create your account"],
  ])("renders public route %s while the session is anonymous", async (path, heading) => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Unauthenticated"));

    renderApp(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
  });

  it.each([
    ["RECRUITER", "Company dashboard"],
    ["ADMIN", "Platform governance"],
  ])("routes %s users from /app to their own workspace", async (role, heading) => {
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "user-1", role } } };
      if (path === "/recruiter/dashboard") return { data: { data: { companies: 1, activeJobs: 0, applications: 0, interviews: 0 } } };
      if (path === "/admin/dashboard") return { data: { data: { users: 1, companies: 0, jobs: 0 } } };
      throw new Error(`Unexpected API request: ${path}`);
    });

    renderApp("/app");

    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
  });

  it("redirects users who open another role's route to their own workspace", async () => {
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "recruiter-1", role: "RECRUITER" } } };
      if (path === "/recruiter/dashboard") return { data: { data: { companies: 1, activeJobs: 0, applications: 0, interviews: 0 } } };
      throw new Error(`Unexpected API request: ${path}`);
    });

    renderApp("/student");

    expect(await screen.findByRole("heading", { name: "Company dashboard" })).toBeTruthy();
  });

  it("renders the recruiter candidates navigation destination", async () => {
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "recruiter-1", role: "RECRUITER" } } };
      if (path === "/recruiter/candidates") {
        return { data: { data: { items: [{ id: "candidate-1", studentProfile: { firstName: "Ada", lastName: "Lovelace", skills: [{ id: "skill-1", skill: { name: "JavaScript" } }] } }], total: 1, pages: 1 } } };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    renderApp("/recruiter/candidates");

    expect(await screen.findByRole("heading", { name: "Candidates" })).toBeTruthy();
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
  });

  it("allows administrators to create target role definitions", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "admin-1", role: "ADMIN" } } };
      if (path === "/admin/target-roles") return { data: { data: [] } };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const createRole = vi.spyOn(api, "post").mockResolvedValue({ data: { data: {} } });

    renderApp("/admin/target-roles");

    await screen.findByRole("heading", { name: "Target roles" });
    await user.type(screen.getByLabelText("Role name"), "Backend Developer");
    await user.type(screen.getByLabelText("URL slug"), "backend-developer");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() => expect(createRole).toHaveBeenCalledWith("/admin/target-roles", expect.objectContaining({
      name: "Backend Developer",
      slug: "backend-developer",
      status: "PUBLISHED",
    })));
  });

  it("shows DSA sheets and real progress counts to students", async () => {
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "student-1", role: "STUDENT" } } };
      if (path === "/dsa-sheets") return { data: { data: [{ id: "sheet-1", slug: "roadmap", name: "DSA Roadmap", total: 3, completed: 1, attempted: 1 }] } };
      throw new Error(`Unexpected API request: ${path}`);
    });

    renderApp("/student/dsa-sheets");

    expect(await screen.findByRole("heading", { name: "DSA preparation sheets" })).toBeTruthy();
    expect(await screen.findByText("1 solved · 1 attempted")).toBeTruthy();
  });

  it("previews DSA sheet metadata before admin import", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "admin-1", role: "ADMIN" } } };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const preview = vi.spyOn(api, "post").mockResolvedValue({
      data: { data: { name: "Roadmap", slug: "roadmap", valid: true, problems: [{ sequence: 1, title: "Two Sum", valid: true, mapped: true }] } },
    });

    renderApp("/admin/dsa-sheets");

    await screen.findByRole("heading", { name: "Import DSA sheet metadata" });
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    expect(await screen.findByRole("button", { name: "Confirm and import" })).toBeTruthy();
    await waitFor(() => expect(preview).toHaveBeenCalledWith("/admin/dsa-sheets/import/preview", expect.objectContaining({
      slug: "careerprepai-dsa-roadmap",
    })));
  });

  it("starts a subject topic, records progress, and opens its learning page", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/auth/me") return { data: { data: { id: "student-1", role: "STUDENT" } } };
      if (path === "/subjects/aptitude") {
        return { data: { data: { id: "subject-1", name: "Aptitude", topics: [{ id: "topic-1", slug: "data-interpretation", name: "Data Interpretation", _count: {} }], resources: [] }, progress: [] } };
      }
      if (path === "/subjects/aptitude/topics/data-interpretation") {
        return { data: { data: { id: "topic-1", name: "Data Interpretation", subject: { name: "Aptitude" }, resources: [], subtopics: [], problemTopics: [] }, progress: [{ topicId: "topic-1", resourceId: null, status: "IN_PROGRESS" }] } };
      }
      if (path === "/subjects/me/progress") return { data: { data: [] } };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { data: { status: "IN_PROGRESS" } } });

    renderApp("/student/subjects/aptitude");

    await user.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/subjects/aptitude/topics/data-interpretation"));
    expect(await screen.findByRole("heading", { name: "Data Interpretation" })).toBeTruthy();
    expect(await screen.findByText(/No resources have been added/)).toBeTruthy();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/subjects/aptitude/topics/data-interpretation/progress", { status: "IN_PROGRESS" }));
  });
});
