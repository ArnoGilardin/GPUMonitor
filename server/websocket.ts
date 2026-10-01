import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyAccessToken } from "./auth";
import { events, type MonitorEvent } from "./services/events";

interface ClientSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

/**
 * Pushes lightweight invalidation events to the browser. Clients refetch
 * what they display, so no heavy payload is computed per broadcast.
 */
export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: (info: any) => {
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get("token");
      return !!token && !!verifyAccessToken(token);
    },
  });

  wss.on("connection", (ws: ClientSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const decoded = verifyAccessToken(url.searchParams.get("token") || "");
    if (!decoded) {
      ws.close(1008, "Invalid token");
      return;
    }
    ws.userId = decoded.userId;
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("error", (err) => console.error("WebSocket client error:", err.message));
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  });

  // Coalesce metric events: at most one "metrics" push every 2 seconds, listing changed servers
  let pendingServers = new Set<string>();
  let flushTimer: NodeJS.Timeout | null = null;

  const broadcast = (message: object) => {
    const data = JSON.stringify({ ...message, timestamp: new Date().toISOString() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
  };

  const unsubscribe = events.onEvent((event: MonitorEvent) => {
    if (event.type === "metrics") {
      pendingServers.add(event.serverId);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          broadcast({ type: "metrics", serverIds: Array.from(pendingServers) });
          pendingServers = new Set();
          flushTimer = null;
        }, 2000);
      }
    } else {
      broadcast(event);
    }
  });

  // Drop dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((client: ClientSocket) => {
      if (client.isAlive === false) return client.terminate();
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  return wss;
}
