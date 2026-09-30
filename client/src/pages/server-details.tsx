import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Activity, Thermometer, Zap, MemoryStick, Cpu, Network, Download, Pencil, Wrench, KeyRound, Trash2 } from "lucide-react";
import Header from "@/components/layout/header";
import MetricChart, { type Series } from "@/components/charts/metric-chart";
import AlertItem, { type AlertView } from "@/components/alert-item";
import ServerFormDialog from "@/components/server-form-dialog";
import InstallInstructionsDialog from "@/components/install-instructions";
import { StatusBadge, Meter } from "@/components/status";
import { useServerActions } from "@/pages/servers";
import { apiDownload, ApiError } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { timeAgo, formatUptime, formatBytesPerSec, formatMB } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ServerView } from "@shared/schema";

interface Metrics {
  bucketSec: number;
  system: Array<Record<string, number | string | null>>;
  gpus: Array<Record<string, number | string | null>>;
}

const RANGES: Array<[string, number]> = [["1h", 1], ["6h", 6], ["24h", 24], ["7d", 168], ["30d", 720]];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-border last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate">{value ?? "—"}</span>
    </div>
  );
}

export default function ServerDetails() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [hours, setHours] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "rotate" | null>(null);
  const actions = useServerActions();

  const { data: server, error } = useQuery<ServerView>({ queryKey: ["/api/servers", id], enabled: !!id, refetchInterval: 60000 });
  const { data: metrics, isLoading: metricsLoading } = useQuery<Metrics>({
    queryKey: ["/api/servers", id, "metrics", { hours }],
    enabled: !!id,
    refetchInterval: hours <= 6 ? 30000 : 300000,
  });
  const { data: alerts = [] } = useQuery<AlertView[]>({ queryKey: ["/api/alerts", { serverId: id, limit: 20 }], enabled: !!id });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="bg-background min-h-full">
        <Header title="Server not found" subtitle={id} />
        <div className="p-6">
          <Button variant="ghost" asChild><Link href="/servers"><ArrowLeft className="h-4 w-4 mr-2" />Back to servers</Link></Button>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="bg-background min-h-full">
        <Header title="Loading…" subtitle="" />
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" /><Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const gpuSeries = (suffix: string): Series[] =>
    server.gpus.map((g) => ({ key: `gpu${g.gpuIndex}_${suffix}`, label: `GPU ${g.gpuIndex}` }));
  const system = metrics?.system ?? [];
  const gpuData = metrics?.gpus ?? [];
  const vramUsed = server.gpus.reduce((s, g) => s + g.vramUsedMB, 0);
  const vramTotal = server.gpus.reduce((s, g) => s + g.vramTotalMB, 0);

  const exportCsv = async () => {
    try {
      await apiDownload(`/api/servers/${server.id}/export.csv?hours=${hours}`, `${server.id}-metrics.csv`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const chartProps = { rangeHours: hours, height: 220 };

  return (
    <div className="bg-background min-h-full">
      <Header title={server.name} subtitle={[server.id, server.hostname, server.ip].filter(Boolean).join(" · ")} />

      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => history.length > 1 ? history.back() : navigate("/")} data-testid="back-button">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <StatusBadge status={server.status} />
            {server.tags.map((t) => <Badge key={t} variant="outline" className="font-normal">{t}</Badge>)}
            <span className="text-xs text-muted-foreground">Last report {timeAgo(server.lastSeenAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" value={String(hours)} onValueChange={(v) => v && setHours(Number(v))} variant="outline" size="sm" data-testid="range-selector">
              {RANGES.map(([label, h]) => <ToggleGroupItem key={h} value={String(h)} className="px-3">{label}</ToggleGroupItem>)}
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={exportCsv} data-testid="export-csv"><Download className="h-4 w-4 mr-1" />CSV</Button>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                <Button variant="outline" size="sm" onClick={() => actions.maintenance.mutate({ id: server.id, on: !server.maintenance })} data-testid="toggle-maintenance">
                  <Wrench className="h-4 w-4 mr-1" />{server.maintenance ? "End maintenance" : "Maintenance"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirm("rotate")}><KeyRound className="h-4 w-4 mr-1" />Key</Button>
                <Button variant="outline" size="sm" className="text-error" onClick={() => setConfirm("delete")} aria-label="Delete server"><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        </div>

        {server.status === "pending" && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-sm text-muted-foreground">
              This server has not reported yet. Install the collector with the key shown when the server was created
              {isAdmin ? <>, or <button className="text-primary underline" onClick={() => setConfirm("rotate")}>generate a new key</button></> : ""}.
            </CardContent>
          </Card>
        )}

        {/* Current state */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {[
            { label: "GPU util", value: server.gpuUtil === null ? "—" : `${server.gpuUtil}%`, meter: server.gpuUtil },
            { label: "Max GPU temp", value: server.maxGpuTempC === null ? "—" : `${server.maxGpuTempC}°C`, meter: server.maxGpuTempC, warn: 80, crit: 88 },
            { label: "GPU power", value: `${server.totalPowerW} W` },
            { label: "VRAM", value: vramTotal ? `${formatMB(vramUsed)} / ${formatMB(vramTotal)}` : "—", meter: vramTotal ? (vramUsed / vramTotal) * 100 : null },
            { label: "CPU / RAM", value: `${server.cpuPercent ?? "—"}% / ${server.ramPercent ?? "—"}%`, meter: server.cpuPercent },
            { label: "Disk", value: server.diskPercent === null ? "—" : `${server.diskPercent}%`, meter: server.diskPercent },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-semibold mt-1 truncate">{m.value}</p>
                {m.meter !== undefined && <Meter value={m.meter} warn={m.warn} crit={m.crit} className="mt-2" />}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><Activity className="h-4 w-4 mr-2" />GPU utilization</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : <MetricChart data={gpuData} series={gpuSeries("util")} domain={[0, 100]} unit="%" {...chartProps} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><Thermometer className="h-4 w-4 mr-2" />GPU temperature</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : <MetricChart data={gpuData} series={gpuSeries("temp")} domain={["auto", "auto"]} unit="°C" {...chartProps} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><Zap className="h-4 w-4 mr-2" />Power draw</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : (
                <MetricChart data={gpuData} type="area" series={[{ key: "powerTotal", label: "Total", color: "var(--chart-3)" }]} unit=" W" {...chartProps} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><MemoryStick className="h-4 w-4 mr-2" />VRAM usage</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : <MetricChart data={gpuData} series={gpuSeries("vram")} domain={[0, 100]} unit="%" {...chartProps} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><Cpu className="h-4 w-4 mr-2" />System resources</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : (
                <MetricChart data={system} domain={[0, 100]} unit="%" {...chartProps}
                  series={[{ key: "cpu", label: "CPU" }, { key: "ram", label: "RAM" }, { key: "disk", label: "Disk" }]} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center text-base"><Network className="h-4 w-4 mr-2" />Network</CardTitle></CardHeader>
            <CardContent>
              {metricsLoading ? <Skeleton className="h-[220px]" /> : (
                <MetricChart data={system} type="area" formatValue={formatBytesPerSec} {...chartProps}
                  series={[{ key: "netRx", label: "Received", color: "var(--chart-2)" }, { key: "netTx", label: "Sent", color: "var(--chart-4)" }]} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle className="text-base">GPUs</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table data-testid="gpu-details-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Util</TableHead>
                    <TableHead>VRAM</TableHead>
                    <TableHead>Temp</TableHead>
                    <TableHead>Power</TableHead>
                    <TableHead>Fan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {server.gpus.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No GPU reported</TableCell></TableRow>
                  ) : server.gpus.map((g) => (
                    <TableRow key={g.gpuIndex} data-testid={`gpu-row-${g.gpuIndex}`}>
                      <TableCell>{g.gpuIndex}</TableCell>
                      <TableCell>
                        <div className="text-sm">{g.name}</div>
                        <div className="text-xs text-muted-foreground">driver {g.driverVersion ?? "?"}</div>
                      </TableCell>
                      <TableCell className="min-w-28">
                        <div className="text-sm">{g.utilPercent}%</div>
                        <Meter value={g.utilPercent} warn={101} crit={101} className="mt-1" />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {g.vramTotalMB ? `${formatMB(g.vramUsedMB)} / ${formatMB(g.vramTotalMB)}` : "—"}
                      </TableCell>
                      <TableCell className={cn("text-sm", g.tempC >= 85 ? "text-error" : g.tempC >= 80 ? "text-warning" : "")}>{g.tempC}°C</TableCell>
                      <TableCell className="text-sm">{g.powerW} W</TableCell>
                      <TableCell className="text-sm">{g.fanPercent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">System</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Hostname" value={server.hostname} />
              <InfoRow label="IP" value={server.ip} />
              <InfoRow label="OS" value={server.os} />
              <InfoRow label="CPU" value={server.cpuModel ? `${server.cpuModel}${server.cpuCores ? ` (${server.cpuCores} threads)` : ""}` : null} />
              <InfoRow label="Load (1m)" value={server.load1} />
              <InfoRow label="Uptime" value={formatUptime(server.uptimeSec)} />
              <InfoRow label="Location" value={server.location} />
              <InfoRow label="Collector" value={server.collectorVersion} />
              <InfoRow label="Collector key" value={server.hasOwnKey ? `${server.apiKeyPrefix}…` : "global key"} />
              <InfoRow label="Registered" value={new Date(server.createdAt).toLocaleDateString()} />
              {server.description && <p className="text-sm text-muted-foreground mt-3">{server.description}</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Alerts on this server</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link href="/alerts">All alerts</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">No alerts recorded</p>
            ) : alerts.map((a) => <AlertItem key={a.id} alert={a} showServer={false} />)}
          </CardContent>
        </Card>
      </div>

      <ServerFormDialog open={editOpen} onOpenChange={setEditOpen} server={server} />
      {actions.install && <InstallInstructionsDialog open onOpenChange={(o) => !o && actions.setInstall(null)} {...actions.install} />}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${server.name}?` : `New collector key for ${server.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "All its metrics and alerts are deleted. This cannot be undone."
                : "The current key stops working immediately; update the collector with the new key."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground" : undefined}
              onClick={() => {
                if (confirm === "delete") {
                  actions.remove.mutate(server.id, { onSuccess: () => navigate("/servers") });
                } else {
                  actions.rotate.mutate(server);
                }
              }}
            >
              {confirm === "delete" ? "Delete" : "Generate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
