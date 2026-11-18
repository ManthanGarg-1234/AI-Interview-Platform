import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";

const AuthContext = createContext(null);
const publicPaths = new Set(["/", "/login", "/register", "/forgot-password", "/verify-email", "/reset-password"]);

export function AuthProvider({ children }) {
  const location = useLocation();
  const isPublicRoute = publicPaths.has(location.pathname);
  const session = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await api.get("/auth/me")).data.data,
    retry: false,
    enabled: !isPublicRoute,
  });

  return (
    <AuthContext.Provider value={{
      user: session.data || null,
      isLoading: !isPublicRoute && session.isLoading,
      error: isPublicRoute ? null : session.error,
      refresh: session.refetch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
