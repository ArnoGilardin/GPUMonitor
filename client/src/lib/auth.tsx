import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "./queryClient";

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    const storedRefreshToken = localStorage.getItem("auth_refresh_token");
    const storedUser = localStorage.getItem("auth_user");
    
    if (storedToken && storedRefreshToken && storedUser) {
      try {
        setToken(storedToken);
        setRefreshToken(storedRefreshToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_refresh_token");
        localStorage.removeItem("auth_user");
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        username,
        password,
      });
      
      const data = await response.json();
      
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
      
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_refresh_token", data.refreshToken);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
    } catch (error) {
      throw error;
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const response = await apiRequest("POST", "/api/auth/register", {
        username,
        password,
      });
      
      const data = await response.json();
      
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
      
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_refresh_token", data.refreshToken);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
    } catch (error) {
      throw error;
    }
  };

  const refreshAccessToken = async (): Promise<string | null> => {
    try {
      if (!refreshToken) {
        return null;
      }

      // Call refresh endpoint directly to avoid nested refresh logic
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Refresh failed");
      }
      
      const data = await response.json();
      const newAccessToken = data.token;
      
      setToken(newAccessToken);
      localStorage.setItem("auth_token", newAccessToken);
      
      return newAccessToken;
    } catch (error) {
      // Refresh token is invalid, logout user
      await logout();
      return null;
    }
  };

  const logout = async () => {
    try {
      if (refreshToken) {
        await apiRequest("POST", "/api/auth/logout", {
          refreshToken,
        });
      }
    } catch (error) {
      // Ignore logout errors - still clear local state
      console.error("Logout error:", error);
    }
    
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_refresh_token");
    localStorage.removeItem("auth_user");
  };

  const value = {
    user,
    token,
    refreshToken,
    isAuthenticated: !!token,
    isLoading,
    login,
    register,
    logout,
    refreshAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
