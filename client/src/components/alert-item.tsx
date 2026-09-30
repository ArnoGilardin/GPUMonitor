import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Alert } from "@shared/schema";

export type AlertView = Omit<Alert, "firedAt" | "resolvedAt" | "acknowledgedAt"> & {
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  server?: { name: string | null } | null;
  rule?: { name: string | null; type: string | null } | null;
};

function duration(from: string, to: string | null) {
  const sec = ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000;
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export default function AlertItem({ alert, showServer = true }: { alert: AlertView; showServer?: boolean }) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (action: "resolve" | "acknowledge") => {
      await apiRequest("PATCH", `/api/alerts/${alert.id}/${action}`);
      return action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({ title: action === "resolve" ? "Alert resolved" : "Alert acknowledged" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const isResolved = !!alert.resolvedAt;
  const isAcked = !!alert.acknowledgedAt;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border",
        isResolved
          ? "bg-muted/20 border-border"
          : alert.level === "critical"
            ? "bg-error/10 border-error/30"
            : "bg-warning/10 border-warning/30",
      )}
      data-testid={`alert-${alert.id}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span
          className={cn(
            "mt-1.5 w-2.5 h-2.5 rounded-full shrink-0",
            isResolved ? "bg-success" : alert.level === "critical" ? "bg-error" : "bg-warning",
          )}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{alert.rule?.name ?? "Alert"}</span>
            <Badge variant="outline" className={cn("text-xs", alert.level === "critical" ? "text-error border-error/40" : "text-warning border-warning/40")}>
              {alert.level}
            </Badge>
            {isResolved && <Badge variant="secondary" className="text-xs">resolved{alert.resolvedBy === "auto" ? " automatically" : alert.resolvedBy ? ` by ${alert.resolvedBy}` : ""}</Badge>}
            {!isResolved && isAcked && <Badge variant="secondary" className="text-xs">acknowledged by {alert.acknowledgedBy}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {showServer && (
              <>
                <Link href={`/servers/${alert.serverId}`} className="text-primary hover:underline">
                  {alert.server?.name ?? alert.serverId}
                </Link>
                {" · "}
              </>
            )}
            fired {timeAgo(alert.firedAt)} · lasted {duration(alert.firedAt, alert.resolvedAt)}
          </p>
        </div>
      </div>

      {!isResolved && (
        <div className="flex gap-2 sm:shrink-0">
          {!isAcked && (
            <Button variant="outline" size="sm" onClick={() => mutation.mutate("acknowledge")} disabled={mutation.isPending} data-testid={`ack-alert-${alert.id}`}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Ack
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => mutation.mutate("resolve")} disabled={mutation.isPending} data-testid={`resolve-alert-${alert.id}`}>
              <Check className="h-3.5 w-3.5 mr-1" /> Resolve
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
