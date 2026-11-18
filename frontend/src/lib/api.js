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

export function getApiError(error) {
  return mapApiValidationError(error).summary;
}

export { mapApiValidationError };
