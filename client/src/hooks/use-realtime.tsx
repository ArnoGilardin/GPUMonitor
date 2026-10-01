import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getAccessToken, refreshAccessToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type RealtimeState = "connecting" | "live" | "offline";

const RealtimeContext = createContext<RealtimeState>("offline");

export function useRealtimeState() {
  return useContext(RealtimeContext);
}

/**
 * One WebSocket per tab. Server events only say *what* changed; we
 * invalidate the matching queries and React Query refetches what is on screen.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [state, setState] = useState<RealtimeState>("offline");
  const attempts = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const scheduleReconnect = () => {
      if (stopped) return;
      attempts.current++;
      const delay = Math.min(1000 * 2 ** Math.min(attempts.current, 6), 60000);
      timer = setTimeout(connect, delay);
    };

    async function connect() {
      if (stopped) return;
      setState("connecting");
      // Access tokens are short-lived: refresh before reconnecting after a few failures
      let token = getAccessToken();
      if (attempts.current > 0 && attempts.current % 2 === 0) token = (await refreshAccessToken()) ?? token;
      if (!token || stopped) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        attempts.current = 0;
        setState("live");
      };

      ws.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "metrics") {
          queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
        } else if (msg.type === "servers") {
          queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
        } else if (msg.type === "alert") {
          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          if (msg.action === "fired") {
            toast({
              title: `${msg.level === "critical" ? "Critical" : "Warning"} alert${msg.serverName ? ` · ${msg.serverName}` : ""}`,
              description: msg.message,
              variant: msg.level === "critical" ? "destructive" : "default",
            });
          }
        }
      };

      ws.onclose = () => {
        ws = null;
        setState("offline");
        scheduleReconnect();
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      setState("offline");
    };
  }, [isAuthenticated, queryClient, toast]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}
