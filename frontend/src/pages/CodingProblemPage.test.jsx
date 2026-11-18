import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import CodingProblemPage from "./CodingProblemPage";

vi.mock("@monaco-editor/react", () => ({
  default: ({ language, value, onChange }) => (
    <textarea
      data-testid="monaco-editor"
      data-language={language}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const readyExecutionHealth = {
  ready: true,
  redis: "ready",
  worker: "ready",
  jdoodle: {
    status: "ready",
    configured: true,
    usage: { used: 2, dailyLimit: 20, remaining: 18 },
  },
};

describe("coding problem language support", () => {
  it("exposes Java only and loads Java starter code into Monaco", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (path, options) => {
        if (path === "/coding/problems/example")
          return {
            data: {
              data: {
                id: "problem-1",
                slug: "example",
                title: "Example",
                difficulty: "Easy",
                statement: "Read input and print output.",
                languages: ["Java"],
              },
            },
          };
        if (path === "/coding/execution-health")
          return { data: { data: readyExecutionHealth } };
        if (path === "/coding/submissions")
          return { data: { data: { items: [] } } };
        if (path === "/coding/problems/example/starter-code")
          return {
            data: {
              data: {
                language: options.params.language,
                starterCode: "class Main {}",
              },
            },
          };
        throw new Error(`Unexpected API request: ${path}`);
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const languageSelect = await screen.findByRole("combobox");
    expect(languageSelect.options).toHaveLength(1);
    expect(languageSelect.options[0].value).toBe("Java");
    await user.selectOptions(languageSelect, "Java");
    await waitFor(() =>
      expect(screen.getByTestId("monaco-editor").dataset.language).toBe("java"),
    );
    expect(get).toHaveBeenCalledWith("/coding/problems/example/starter-code", {
      params: { language: "Java" },
    });
  });

  it("runs Java with empty custom input and displays the structured provider result", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (path, options) => {
        if (path === "/coding/problems/example")
          return {
            data: {
              data: {
                id: "problem-1",
                slug: "example",
                title: "Example",
                difficulty: "Easy",
                statement: "Print a result.",
                languages: ["Java"],
              },
            },
          };
        if (path === "/coding/execution-health")
          return { data: { data: readyExecutionHealth } };
        if (path === "/coding/submissions")
          return { data: { data: { items: [] } } };
        if (path === "/coding/problems/example/starter-code")
          return {
            data: { data: { language: "Java", starterCode: "class Main {}" } },
          };
        if (path === "/coding/runs/run-1")
          return {
            data: {
              data: {
                id: "run-1",
                status: "COMPLETED",
                verdict: "ACCEPTED",
                executionTimeMs: 12,
                memoryKb: 2048,
                perTestResults: {
                  tests: [
                    {
                      sequence: 1,
                      kind: "CUSTOM",
                      input: "",
                      expectedOutput: null,
                      stdout: "2\n",
                      stderr: "",
                      compileOutput: "",
                      executionTimeMs: 12,
                      memoryKb: 2048,
                      passed: null,
                      verdict: "ACCEPTED",
                    },
                  ],
                  totalTests: 0,
                  executedTests: 1,
                  passedTests: 0,
                  failedTests: 0,
                },
              },
            },
          };
        throw new Error(`Unexpected API request: ${path}`);
      });
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        data: { id: "run-1", message: "Queued for JDoodle execution." },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByTestId("monaco-editor");
    await user.click(
      screen.getByLabelText("Run with custom input instead of public examples"),
    );
    await user.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/coding/runs", {
        problemId: "problem-1",
        language: "Java",
        sourceCode: "class Main {}",
        customInput: "",
      }),
    );
    expect(
      await screen.findByText("Run result: COMPLETED / Passed"),
    ).toBeTruthy();
    expect(screen.getByText("Actual output")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/coding/runs/run-1");
  });

  it("shows sanitized provider diagnostics in a failed Run result", async () => {
    const user = userEvent.setup();
    const providerMessage =
      "JDoodle rejected the execution request. Invalid request field [REDACTED].";
    const get = vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/coding/problems/example")
        return {
          data: {
            data: {
              id: "problem-1",
              slug: "example",
              title: "Example",
              difficulty: "Easy",
              statement: "Print a result.",
              languages: ["Java"],
            },
          },
        };
      if (path === "/coding/execution-health")
        return { data: { data: readyExecutionHealth } };
      if (path === "/coding/submissions")
        return { data: { data: { items: [] } } };
      if (path === "/coding/problems/example/starter-code")
        return {
          data: { data: { language: "Java", starterCode: "class Main {}" } },
        };
      if (path === "/coding/runs/run-failed")
        return {
          data: {
            data: {
              id: "run-failed",
              status: "FAILED",
              verdict: "INTERNAL_ERROR",
              provider: "jdoodle",
              stderr: providerMessage,
            },
          },
        };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        data: { id: "run-failed", message: "Queued for JDoodle execution." },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByTestId("monaco-editor");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText(providerMessage)).toBeTruthy();
    expect(post).toHaveBeenCalledWith(
      "/coding/runs",
      expect.objectContaining({ language: "Java" }),
    );
  });

  it("distinguishes unavailable Redis, JDoodle authentication, and worker services", async () => {
    const get = vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/coding/problems/example")
        return {
          data: {
            data: {
              id: "problem-1",
              slug: "example",
              title: "Example",
              difficulty: "Easy",
              statement: "Print a result.",
              languages: ["Java"],
            },
          },
        };
      if (path === "/coding/execution-health")
        return {
          data: {
            data: {
              ready: false,
              redis: "unavailable",
              worker: "unavailable",
              jdoodle: { status: "authentication_failed", configured: false },
            },
          },
        };
      if (path === "/coding/submissions")
        return { data: { data: { items: [] } } };
      if (path === "/coding/problems/example/starter-code")
        return {
          data: { data: { language: "Java", starterCode: "class Main {}" } },
        };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Code execution infrastructure needs attention"),
    ).toBeTruthy();
    expect(screen.getByText("Redis: Unavailable")).toBeTruthy();
    expect(screen.getByText("JDoodle: Authentication failed")).toBeTruthy();
    expect(screen.getByText("Worker: Unavailable")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/coding/execution-health");
  });

  it("disables Run while the request is pending to prevent duplicate requests", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/coding/problems/example")
        return {
          data: {
            data: {
              id: "problem-1",
              slug: "example",
              title: "Example",
              difficulty: "Easy",
              statement: "Print a result.",
              languages: ["Java"],
            },
          },
        };
      if (path === "/coding/submissions")
        return { data: { data: { items: [] } } };
      if (path === "/coding/problems/example/starter-code")
        return {
          data: { data: { language: "Java", starterCode: "class Main {}" } },
        };
      if (path === "/coding/runs/run-1")
        return {
          data: { data: { id: "run-1", status: "QUEUED", verdict: "PENDING" } },
        };
      throw new Error(`Unexpected API request: ${path}`);
    });
    let resolvePost;
    const post = vi.spyOn(api, "post").mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByTestId("monaco-editor");
    await waitFor(() =>
      expect(screen.getByTestId("monaco-editor").value).toBe("class Main {}"),
    );
    const runButton = screen.getByRole("button", { name: "Run" });
    await user.click(runButton);
    expect(
      await screen.findByRole("button", { name: "Running…" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Running…" }));
    expect(post).toHaveBeenCalledTimes(1);

    resolvePost({ data: { data: { id: "run-1", message: "Queued." } } });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/coding/runs/run-1"));
  });

  it("submits code once and displays the persisted verdict, score, and test summary", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, "get").mockImplementation(async (path) => {
      if (path === "/coding/problems/example")
        return {
          data: {
            data: {
              id: "problem-1",
              slug: "example",
              title: "Example",
              difficulty: "Easy",
              statement: "Print a result.",
              languages: ["Java"],
            },
          },
        };
      if (path === "/coding/execution-health")
        return { data: { data: readyExecutionHealth } };
      if (path === "/coding/problems/example/starter-code")
        return {
          data: { data: { language: "Java", starterCode: "class Main {}" } },
        };
      if (path === "/coding/submissions")
        return { data: { data: { items: [] } } };
      if (path === "/coding/submissions/submission-1")
        return {
          data: {
            data: {
              id: "submission-1",
              status: "WRONG_ANSWER",
              verdict: "WRONG_ANSWER",
              executionResults: [
                {
                  passedTests: 1,
                  failedTests: 1,
                  totalTests: 2,
                  evaluatedTests: 2,
                  score: 50,
                  executionTimeMs: 21,
                  memoryKb: 2048,
                  perTestSummary: [
                    {
                      sequence: 1,
                      kind: "PUBLIC",
                      passed: true,
                      verdict: "ACCEPTED",
                      stdout: "2\n",
                      executionTimeMs: 10,
                      memoryKb: 1024,
                    },
                    {
                      sequence: 2,
                      kind: "HIDDEN",
                      passed: false,
                      verdict: "WRONG_ANSWER",
                      executionTimeMs: 11,
                      memoryKb: 2048,
                    },
                  ],
                },
              ],
            },
          },
        };
      throw new Error(`Unexpected API request: ${path}`);
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        data: { id: "submission-1", status: "QUEUED", verdict: "PENDING" },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByTestId("monaco-editor");
    await waitFor(() =>
      expect(screen.getByTestId("monaco-editor").value).toBe("class Main {}"),
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      "/coding/submissions",
      expect.objectContaining({
        problemId: "problem-1",
        language: "Java",
        sourceCode: "class Main {}",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(
      await screen.findByText("Submission result: Wrong Answer / Failed"),
    ).toBeTruthy();
    expect(
      screen.getByText("Tests: 1 passed, 1 failed of 2 total (2 evaluated)"),
    ).toBeTruthy();
    expect(screen.getByText("Score: 50%")).toBeTruthy();
    expect(screen.getByText("Hidden test 2: Failed — Failed")).toBeTruthy();
    expect(screen.queryByText(/hidden expected|hidden input/i)).toBeNull();
  });

  it("restores the latest submission result from problem history after a page refresh", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (path, options) => {
        if (path === "/coding/problems/example")
          return {
            data: {
              data: {
                id: "problem-1",
                slug: "example",
                title: "Example",
                difficulty: "Easy",
                statement: "Print a result.",
                languages: ["Java"],
              },
            },
          };
        if (path === "/coding/problems/example/starter-code")
          return {
            data: { data: { language: "Java", starterCode: "class Main {}" } },
          };
        if (path === "/coding/submissions") {
          expect(options.params).toEqual({
            problemId: "problem-1",
            pageSize: 1,
          });
          return { data: { data: { items: [{ id: "submission-1" }] } } };
        }
        if (path === "/coding/submissions/submission-1")
          return {
            data: {
              data: {
                id: "submission-1",
                status: "ACCEPTED",
                verdict: "ACCEPTED",
                executionResults: [
                  {
                    passedTests: 2,
                    failedTests: 0,
                    totalTests: 2,
                    evaluatedTests: 2,
                    score: 100,
                    executionTimeMs: 19,
                    memoryKb: 1536,
                    perTestSummary: [
                      {
                        sequence: 1,
                        kind: "PUBLIC",
                        passed: true,
                        verdict: "ACCEPTED",
                      },
                      {
                        sequence: 2,
                        kind: "HIDDEN",
                        passed: true,
                        verdict: "ACCEPTED",
                      },
                    ],
                  },
                ],
              },
            },
          };
        throw new Error(`Unexpected API request: ${path}`);
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/student/coding/example"]}>
          <Routes>
            <Route
              path="/student/coding/:slug"
              element={<CodingProblemPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Submission result: Accepted / Passed"),
    ).toBeTruthy();
    expect(
      screen.getByText("Tests: 2 passed, 0 failed of 2 total (2 evaluated)"),
    ).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/coding/submissions/submission-1");
  });
});
