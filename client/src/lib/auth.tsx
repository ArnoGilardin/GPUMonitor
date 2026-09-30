import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { apiRequest, clearSession, queryClient } from "./queryClient";

export interface User {
  id: string;
  username: string;
  role: "admin" | "viewer";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("auth_user");
    if (storedToken && localStorage.getItem("auth_refresh_token") && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        clearSession();
      }
    }
    setIsLoading(false);

    // Keep React state in sync with token refreshes done by the query layer
    const onRefreshed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setToken(detail.token);
      if (detail.user) setUser(detail.user);
    };
    const onLogout = () => {
      setToken(null);
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("auth:refreshed", onRefreshed);
    window.addEventListener("auth:logout", onLogout);
    return () => {
      window.removeEventListener("auth:refreshed", onRefreshed);
      window.removeEventListener("auth:logout", onLogout);
    };
  }, []);

  const storeSession = (data: { token: string; refreshToken: string; user: User }) => {
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_refresh_token", data.refreshToken);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
  };

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiRequest("POST", "/api/auth/login", { username, password });
    storeSession(await response.json());
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const response = await apiRequest("POST", "/api/auth/register", { username, password });
    storeSession(await response.json());
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem("auth_refresh_token");
    try {
      if (refreshToken) await apiRequest("POST", "/api/auth/logout", { refreshToken });
    } catch (error) {
      console.error("Logout error:", error);
    }
    clearSession();
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token,
    isAdmin: user?.role === "admin",
    isLoading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
