import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";

interface WebSocketMessage {
  type: string;
  timestamp: string;
  data?: any;
}

interface UseWebSocketOptions {
  serverId?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { token } = useAuth();
  const { serverId, onMessage, onError, reconnectInterval = 5000, maxReconnectAttempts = 10 } = options;
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef<number>(0);
  const currentDelay = useRef<number>(reconnectInterval);

  const connect = useCallback(() => {
    if (!token) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host || 'localhost:5000';
      const wsUrl = `${protocol}//${host}/ws?token=${token}${serverId ? `&serverId=${serverId}` : ""}`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected");
        // Reset reconnection state on successful connection
        reconnectAttempts.current = 0;
        currentDelay.current = reconnectInterval;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          console.error("WebSocket message parse error:", error);
        }
      };

      ws.current.onclose = () => {
        console.log("WebSocket disconnected");
        ws.current = null;
        
        // Attempt to reconnect with exponential backoff
        if (!reconnectTimeoutRef.current && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          
          // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
          currentDelay.current = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts.current - 1), 60000);
          
          console.log(`Reconnecting in ${currentDelay.current / 1000}s (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(connect, currentDelay.current);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error(`Max reconnection attempts (${maxReconnectAttempts}) reached. Please refresh the page.`);
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        onError?.(error);
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      onError?.(error as Event);
    }
  }, [token, serverId, onMessage, onError, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    isConnected: ws.current?.readyState === WebSocket.OPEN,
    sendMessage,
    disconnect,
    reconnect: connect,
  };
}
