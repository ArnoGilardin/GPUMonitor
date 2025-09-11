import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Copy, Power } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Server } from "@shared/schema";

interface ServerCardProps {
  server: Server & {
    status: "online" | "warning" | "error" | "offline";
    cpuPercent?: number;
    ramPercent?: number;
    gpuUtil?: number;
    gpus?: Array<{
      name: string;
      tempC: number;
      powerW: number;
    }>;
    lastSeen?: string;
  };
  onClick?: () => void;
}

export default function ServerCard({ server, onClick }: ServerCardProps) {
  const { toast } = useToast();

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case "online":
        return "status-online";
      case "warning":
        return "status-warning";
      case "error":
        return "status-error";
      default:
        return "status-offline";
    }
  };

  const copyCollectorCommand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const command = `docker run -d --name gpu-collector \\
  -e CENTRAL_API_URL=https://${window.location.host} \\
  -e CENTRAL_API_KEY=collector-key-123 \\
  -e SERVER_ID=${server.id} \\
  --gpus all \\
  gpu-monitor-collector`;
    
    navigator.clipboard.writeText(command);
    toast({
      title: "Copied!",
      description: "Docker command copied to clipboard",
    });
  };

  if (server.status === "offline") {
    return (
      <Card 
        className="p-6 opacity-60 cursor-pointer hover:shadow-lg transition-shadow"
        onClick={onClick}
        data-testid={`server-card-${server.id}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={cn("status-indicator", getStatusIndicator(server.status))}></div>
            <div>
              <h4 className="font-semibold text-foreground">{server.name}</h4>
              <p className="text-sm text-muted-foreground">{server.id}</p>
            </div>
          </div>
          <Badge variant="secondary">Offline</Badge>
        </div>
        
        <div className="text-center py-8">
          <Power className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Server offline</p>
          <p className="text-xs text-muted-foreground mt-1">
            Last seen: {server.lastSeen || "Unknown"}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
      data-testid={`server-card-${server.id}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={cn("status-indicator", getStatusIndicator(server.status))}></div>
          <div>
            <h4 className="font-semibold text-foreground">{server.name}</h4>
            <p className="text-sm text-muted-foreground">{server.id}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {server.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {server.status === "warning" && (
            <Badge variant="outline" className="text-xs bg-warning/20 text-warning border-warning/20">
              Warning
            </Badge>
          )}
          {server.status === "error" && (
            <Badge variant="destructive" className="text-xs">
              Critical
            </Badge>
          )}
        </div>
      </div>
      
      <div className="space-y-4">
        {/* GPU Utilization */}
        {server.gpuUtil !== undefined && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">GPU Utilization</span>
              <span className="text-sm font-medium text-foreground">{server.gpuUtil}%</span>
            </div>
            <div className="metric-sparkline"></div>
          </div>
        )}
        
        {/* System Metrics */}
        <div className="grid grid-cols-2 gap-4">
          {server.cpuPercent !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">CPU</span>
                <span className="text-xs font-medium">{server.cpuPercent}%</span>
              </div>
              <Progress 
                value={server.cpuPercent} 
                className={cn(
                  "h-2",
                  server.cpuPercent > 80 ? "[&>div]:bg-warning" : "[&>div]:bg-chart-1"
                )}
              />
            </div>
          )}
          {server.ramPercent !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">RAM</span>
                <span className="text-xs font-medium">{server.ramPercent}%</span>
              </div>
              <Progress 
                value={server.ramPercent} 
                className={cn(
                  "h-2",
                  server.ramPercent > 85 ? "[&>div]:bg-warning" : "[&>div]:bg-chart-2"
                )}
              />
            </div>
          )}
        </div>
        
        {/* GPU List */}
        {server.gpus && server.gpus.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-2">
              GPUs ({server.gpus.length})
            </h5>
            <div className="space-y-2">
              {server.gpus.slice(0, 2).map((gpu, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{gpu.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className={cn(
                      "text-foreground",
                      gpu.tempC > 80 ? "text-warning" : "",
                      gpu.tempC > 85 ? "text-error" : ""
                    )}>
                      {gpu.tempC}°C
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-foreground">{gpu.powerW}W</span>
                  </div>
                </div>
              ))}
              {server.gpus.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  + {server.gpus.length - 2} more GPUs
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Last seen: {server.lastSeen || "Just now"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyCollectorCommand}
            className="text-xs text-primary hover:text-primary"
            data-testid={`copy-docker-${server.id}`}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy Docker
          </Button>
        </div>
      </div>
    </Card>
  );
}
