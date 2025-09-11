import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  serverId?: string;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server, 
    path: "/ws",
    verifyClient: (info: any) => {
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get("token");
      
      if (!token) {
        return false;
      }

      try {
        jwt.verify(token, JWT_SECRET);
        return true;
      } catch {
        return false;
      }
    }
  });

  wss.on("connection", (ws: AuthenticatedWebSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const serverId = url.searchParams.get("serverId");

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        ws.userId = decoded.userId;
        ws.serverId = serverId || undefined;
      } catch {
        ws.close(1008, "Invalid token");
        return;
      }
    }

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "subscribe") {
          ws.serverId = data.serverId;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });

    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  });

  // Broadcast updates to connected clients
  setInterval(async () => {
    if (wss.clients.size === 0) return;

    try {
      const servers = await storage.getServersWithMetrics();
      const stats = await storage.getStats();

      wss.clients.forEach((client: AuthenticatedWebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          const message = {
            type: "update",
            timestamp: new Date().toISOString(),
            data: {
              servers: client.serverId ? 
                servers.filter(s => s.id === client.serverId) : 
                servers,
              stats,
            }
          };
          
          client.send(JSON.stringify(message));
        }
      });
    } catch (error) {
      console.error("WebSocket broadcast error:", error);
    }
  }, 10000); // Broadcast every 10 seconds

  return wss;
}
