import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Thermometer, Zap, AlertTriangle, Wrench, Clock } from "lucide-react";
import { StatusDot, Meter, STATUS_LABELS } from "@/components/status";
import { timeAgo, formatMB } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ServerView } from "@shared/schema";

export default function ServerCard({ server }: { server: ServerView }) {
  const inactive = server.status === "offline" || server.status === "pending" || server.status === "maintenance";
  const vramUsed = server.gpus.reduce((s, g) => s + g.vramUsedMB, 0);
  const vramTotal = server.gpus.reduce((s, g) => s + g.vramTotalMB, 0);

  return (
    <Link href={`/servers/${server.id}`}>
      <Card
        className={cn(
          "p-5 cursor-pointer hover:border-primary/50 transition-colors h-full flex flex-col",
          server.status === "error" && "border-error/50",
          server.status === "warning" && "border-warning/50",
        )}
        data-testid={`server-card-${server.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <StatusDot status={server.status} />
            <div className="min-w-0">
              <h4 className="font-semibold text-foreground truncate">{server.name}</h4>
              <p className="text-xs text-muted-foreground truncate">
                {STATUS_LABELS[server.status]} · {server.gpuCount} GPU{server.gpuCount === 1 ? "" : "s"}
                {server.location ? ` · ${server.location}` : ""}
              </p>
            </div>
          </div>
          {server.activeAlerts > 0 && (
            <Badge variant="outline" className={cn("shrink-0 gap-1", server.status === "error" ? "text-error border-error/40" : "text-warning border-warning/40")}>
              <AlertTriangle className="h-3 w-3" /> {server.activeAlerts}
            </Badge>
          )}
        </div>

        {inactive ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            {server.status === "maintenance" ? <Wrench className="h-8 w-8 mb-2" /> : <Clock className="h-8 w-8 mb-2" />}
            <p className="text-sm">
              {server.status === "pending" ? "Waiting for the collector's first report" : server.status === "maintenance" ? "In maintenance, alerts are muted" : "No data received"}
            </p>
            <p className="text-xs mt-1">Last seen {timeAgo(server.lastSeenAt)}</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {server.gpuCount > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">GPU utilization</span>
                  <span className="font-medium">{server.gpuUtil}%</span>
                </div>
                {/* one bar per GPU gives a quick view of how evenly work is spread */}
                <div className="flex gap-1 h-6 items-end" aria-hidden>
                  {server.gpus.map((g) => (
                    <div key={g.gpuIndex} className="flex-1 bg-muted rounded-sm h-full relative overflow-hidden" title={`GPU ${g.gpuIndex}: ${g.utilPercent}%`}>
                      <div
                        className={cn("absolute bottom-0 inset-x-0 rounded-sm", g.tempC >= 85 ? "bg-error" : g.tempC >= 80 ? "bg-warning" : "bg-chart-1")}
                        style={{ height: `${Math.max(4, g.utilPercent)}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-xs">
              {[
                ["CPU", server.cpuPercent],
                ["RAM", server.ramPercent],
                ["Disk", server.diskPercent],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value === null ? "—" : `${Math.round(value as number)}%`}</span>
                  </div>
                  <Meter value={value as number | null} warn={label === "CPU" ? 85 : 85} crit={95} />
                </div>
              ))}
            </div>

            {server.gpuCount > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><Thermometer className="h-3 w-3" /> max {server.maxGpuTempC}°C</span>
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> {server.totalPowerW} W</span>
                {vramTotal > 0 && <span>VRAM {formatMB(vramUsed)} / {formatMB(vramTotal)}</span>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-border">
          <div className="flex flex-wrap gap-1 min-w-0">
            {server.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{tag}</Badge>
            ))}
            {server.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{server.tags.length - 3}</span>}
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(server.lastSeenAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
