import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServerStatus } from "@shared/schema";

export const STATUS_LABELS: Record<ServerStatus, string> = {
  online: "Online",
  warning: "Warning",
  error: "Critical",
  offline: "Offline",
  pending: "Waiting for data",
  maintenance: "Maintenance",
};

export function StatusDot({ status, className }: { status: ServerStatus; className?: string }) {
  return (
    <span
      className={cn("status-indicator shrink-0", `status-${status}`, className)}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}

export function StatusBadge({ status }: { status: ServerStatus }) {
  const styles: Record<ServerStatus, string> = {
    online: "border-success/40 text-success",
    warning: "border-warning/40 text-warning",
    error: "border-error/40 text-error",
    offline: "text-muted-foreground",
    pending: "text-muted-foreground border-dashed",
    maintenance: "border-chart-4/40 text-chart-4",
  };
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium whitespace-nowrap", styles[status])} data-testid="status-badge">
      <StatusDot status={status} className="w-1.5 h-1.5 !shadow-none" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** Small horizontal gauge coloured by thresholds. */
export function Meter({ value, warn = 80, crit = 90, className }: { value: number | null; warn?: number; crit?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = value === null ? "bg-muted" : v >= crit ? "bg-error" : v >= warn ? "bg-warning" : "bg-chart-1";
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
