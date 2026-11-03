import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export async function getApiError(error) {
  return error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.message
    || "Something went wrong. Please try again.";
}
