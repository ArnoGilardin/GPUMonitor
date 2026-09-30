import { EventEmitter } from "events";

export type MonitorEvent =
  | { type: "metrics"; serverId: string }
  | { type: "servers" }
  | { type: "alert"; action: "fired" | "resolved" | "acknowledged"; alertId: string; serverId: string; level: string; message: string; serverName?: string };

class MonitorEvents extends EventEmitter {
  emitEvent(event: MonitorEvent) {
    this.emit("event", event);
  }
  onEvent(listener: (event: MonitorEvent) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const events = new MonitorEvents();
events.setMaxListeners(50);
