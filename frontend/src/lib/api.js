import axios from "axios";
import { mapApiValidationError } from "./recruiterValidation";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
api.interceptors.request.use((config) => {
  if (typeof document !== "undefined" && !["get", "head", "options"].includes((config.method || "get").toLowerCase())) {
    const token = document.cookie.split("; ").find((item) => item.startsWith("career_csrf="))?.split("=")[1];
    if (token) config.headers["x-csrf-token"] = decodeURIComponent(token);
  }
  return config;
});

let refreshInFlight;
const skipRefreshPaths = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/register/student",
  "/auth/register/recruiter",
  "/auth/refresh",
  "/auth/resend-verification",
  "/auth/verify-email",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/auth/google/start",
  "/auth/firebase/google",
]);

api.interceptors.response.use(undefined, async (error) => {
  const request = error.config;
  if (
    error.response?.status !== 401
    || !request
    || request._authRetry
    || skipRefreshPaths.has(request.url)
  ) {
    return Promise.reject(error);
  }

  request._authRetry = true;
  try {
    if (!refreshInFlight) {
      refreshInFlight = api.post("/auth/refresh").finally(() => {
        refreshInFlight = undefined;
      });
    }
    await refreshInFlight;
    return api.request(request);
  } catch (refreshError) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    return Promise.reject(refreshError);
  }
});

export function getApiError(error) {
  return mapApiValidationError(error).summary;
}

export { mapApiValidationError };
