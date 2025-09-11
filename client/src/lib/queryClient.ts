import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessTokenIfNeeded(): Promise<string | null> {
  if (isRefreshing) {
    return refreshPromise;
  }

  isRefreshing = true;
  const refreshToken = localStorage.getItem("auth_refresh_token");
  
  if (!refreshToken) {
    isRefreshing = false;
    return null;
  }

  refreshPromise = (async () => {
    try {
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
      
      localStorage.setItem("auth_token", newAccessToken);
      return newAccessToken;
    } catch (error) {
      // Clear tokens on refresh failure
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_refresh_token");
      localStorage.removeItem("auth_user");
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const makeRequest = async (accessToken?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return fetch(url, {
      method,
      headers: data ? headers : { Authorization: headers.Authorization || "" },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  };

  // First attempt with current token
  let token = localStorage.getItem("auth_token");
  let res = await makeRequest(token || undefined);

  // If 401 and we have a refresh token, try to refresh
  if (res.status === 401 && localStorage.getItem("auth_refresh_token")) {
    const newToken = await refreshAccessTokenIfNeeded();
    if (newToken) {
      // Retry with new token
      res = await makeRequest(newToken);
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const makeQueryRequest = async (accessToken?: string) => {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      return fetch(queryKey.join("/") as string, {
        headers,
        credentials: "include",
      });
    };

    // First attempt with current token
    let token = localStorage.getItem("auth_token");
    let res = await makeQueryRequest(token || undefined);

    // If 401 and we have a refresh token, try to refresh
    if (res.status === 401 && localStorage.getItem("auth_refresh_token")) {
      const newToken = await refreshAccessTokenIfNeeded();
      if (newToken) {
        // Retry with new token
        res = await makeQueryRequest(newToken);
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 401/403 errors
        if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
