import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Alert } from "@shared/schema";

interface AlertItemProps {
  alert: Alert & {
    server?: { name: string };
    rule?: { name: string };
  };
}

export default function AlertItem({ alert }: AlertItemProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resolveAlertMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/alerts/${alert.id}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({
        title: "Alert Resolved",
        description: "The alert has been marked as resolved",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resolve alert",
        variant: "destructive",
      });
    },
  });

  const getAlertColor = (level: string) => {
    switch (level) {
      case "critical":
        return "destructive";
      case "warning":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getIndicatorColor = (level: string) => {
    switch (level) {
      case "critical":
        return "bg-destructive";
      case "warning":
        return "bg-warning";
      default:
        return "bg-success";
    }
  };

  const isResolved = !!alert.resolvedAt;

  return (
    <div 
      className={cn(
        "flex items-center space-x-4 p-4 rounded-lg border",
        isResolved 
          ? "bg-muted/10 border-border" 
          : alert.level === "critical" 
            ? "bg-destructive/10 border-destructive/20" 
            : "bg-warning/10 border-warning/20"
      )}
      data-testid={`alert-${alert.id}`}
    >
      <div className={cn("w-2 h-2 rounded-full", getIndicatorColor(alert.level))}></div>
      <div className="flex-1">
        <div className="flex items-center space-x-2 mb-1">
          <p className="text-sm font-medium text-foreground">
            {alert.rule?.name || "Alert"}
          </p>
          <Badge variant={getAlertColor(alert.level)}>
            {alert.level}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {alert.server?.name} - {alert.message}
        </p>
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(alert.firedAt).toLocaleString()}
      </div>
      {!isResolved ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resolveAlertMutation.mutate()}
          disabled={resolveAlertMutation.isPending}
          className={cn(
            "text-xs",
            alert.level === "critical" ? "text-destructive hover:text-destructive" : "text-warning hover:text-warning"
          )}
          data-testid={`resolve-alert-${alert.id}`}
        >
          {resolveAlertMutation.isPending ? "Resolving..." : "Resolve"}
        </Button>
      ) : (
        <Badge variant="outline" className="text-xs text-success">
          Resolved
        </Badge>
      )}
    </div>
  );
}
