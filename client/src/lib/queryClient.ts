import { QueryClient, QueryFunction } from "@tanstack/react-query";

const TOKEN_KEY = "auth_token";
const REFRESH_KEY = "auth_refresh_token";
const USER_KEY = "auth_user";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      try {
        message = JSON.parse(text).message || text;
      } catch {
        message = text || message;
      }
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message);
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("auth:logout"));
}

// Single in-flight refresh shared by all callers
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return Promise.resolve(null);

  refreshPromise = (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Refresh failed");
      const data = await response.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      window.dispatchEvent(new CustomEvent("auth:refreshed", { detail: data }));
      return data.token as string;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** fetch with the bearer token, refreshing it once on 401. */
async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
    });

  let res = await send(getAccessToken());
  if (res.status === 401 && localStorage.getItem(REFRESH_KEY) && !url.startsWith("/api/auth/")) {
    const token = await refreshAccessToken();
    if (token) res = await send(token);
  }
  return res;
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await authFetch(url, {
    method,
    headers: data !== undefined ? { "Content-Type": "application/json" } : {},
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

/** Download an authenticated file (e.g. CSV export). */
export async function apiDownload(url: string, filename: string) {
  const res = await authFetch(url);
  await throwIfResNotOk(res);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // ["/api/servers", id, "metrics", { hours: 6 }] -> /api/servers/id/metrics?hours=6
    const parts = queryKey.filter((k) => typeof k === "string" || typeof k === "number");
    const params = queryKey.find((k) => k && typeof k === "object") as Record<string, unknown> | undefined;
    let url = parts.join("/");
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const res = await authFetch(url);
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
      refetchOnWindowFocus: true,
      staleTime: 10 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
