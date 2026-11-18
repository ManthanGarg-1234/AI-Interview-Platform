import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

const defaultAdapter = api.defaults.adapter;

function unauthorized(config) {
  return Promise.reject({
    config,
    response: { status: 401 },
  });
}

function response(config, data = {}) {
  return { config, data, headers: {}, status: 200, statusText: "OK" };
}

describe("API authentication refresh", () => {
  afterEach(() => {
    api.defaults.adapter = defaultAdapter;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes once and retries the original request", async () => {
    const calls = [];
    api.defaults.adapter = async (config) => {
      calls.push(config.url);
      if (config.url === "/protected" && !config._authRetry) return unauthorized(config);
      return response(config, { path: config.url });
    };

    await expect(api.get("/protected")).resolves.toMatchObject({ data: { path: "/protected" } });

    expect(calls.filter((path) => path === "/auth/refresh")).toHaveLength(1);
    expect(calls.filter((path) => path === "/protected")).toHaveLength(2);
  });

  it("shares one in-flight refresh across concurrent 401 responses", async () => {
    let releaseRefresh;
    let refreshStarted;
    const started = new Promise((resolve) => { refreshStarted = resolve; });
    const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
    let refreshCalls = 0;
    api.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        refreshCalls += 1;
        refreshStarted();
        await refreshGate;
        return response(config);
      }
      if (!config._authRetry) return unauthorized(config);
      return response(config, { path: config.url });
    };

    const requests = Promise.all([api.get("/first"), api.get("/second")]);
    await started;
    expect(refreshCalls).toBe(1);
    releaseRefresh();
    await expect(requests).resolves.toHaveLength(2);
    expect(refreshCalls).toBe(1);
  });

  it("redirects to login when refresh fails", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/student", assign } });
    api.defaults.adapter = async (config) => unauthorized(config);

    await expect(api.get("/protected")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does not refresh or redirect for invalid login credentials", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/login", assign } });
    const calls = [];
    api.defaults.adapter = async (config) => {
      calls.push(config.url);
      return unauthorized(config);
    };

    await expect(api.post("/auth/login", { email: "invalid@example.test", password: "wrong" }))
      .rejects.toMatchObject({ response: { status: 401 } });

    expect(calls).toEqual(["/auth/login"]);
    expect(assign).not.toHaveBeenCalled();
  });
});
