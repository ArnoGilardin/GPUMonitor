import { useMemo, useState } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Server as ServerIcon, Zap, AlertTriangle, Activity, MemoryStick, Plus, Search, X } from "lucide-react";
import ServerCard from "@/components/server-card";
import AlertItem, { type AlertView } from "@/components/alert-item";
import Header from "@/components/layout/header";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { FleetStats, ServerView } from "@shared/schema";

type StatusFilter = "all" | "online" | "problems" | "offline";

function StatCard({ label, value, sub, icon: Icon, tone = "default", testId }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: typeof Cpu;
  tone?: "default" | "danger" | "warning" | "success";
  testId?: string;
}) {
  const toneClass = { default: "text-chart-1 bg-chart-1/15", danger: "text-error bg-error/15", warning: "text-warning bg-warning/15", success: "text-success bg-success/15" }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className={cn("text-2xl md:text-3xl font-bold mt-1", tone === "danger" ? "text-error" : "text-foreground")} data-testid={testId}>{value}</p>
          </div>
          <div className={cn("w-11 h-11 rounded-lg hidden sm:flex items-center justify-center shrink-0", toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {sub && <p className="mt-3 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function matchesSearch(server: ServerView, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [server.name, server.id, server.hostname, server.location, server.ip, ...server.tags, ...server.gpus.map((g) => g.name)]
    .some((v) => v?.toLowerCase().includes(needle));
}

export default function Dashboard() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const q = new URLSearchParams(searchString).get("q") ?? "";
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [tag, setTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState("status");

  const { data: servers, isLoading } = useQuery<ServerView[]>({ queryKey: ["/api/servers"], refetchInterval: 60000 });
  const { data: stats } = useQuery<FleetStats>({ queryKey: ["/api/stats"], refetchInterval: 60000 });
  const { data: tags = [] } = useQuery<string[]>({ queryKey: ["/api/tags"] });
  const { data: recentAlerts = [] } = useQuery<AlertView[]>({ queryKey: ["/api/alerts", { status: "active", limit: 5 }], refetchInterval: 60000 });

  const statusRank: Record<string, number> = { error: 0, warning: 1, offline: 2, online: 3, pending: 4, maintenance: 5 };

  const visible = useMemo(() => {
    const list = (servers ?? []).filter((s) => {
      if (filter === "online" && !["online", "warning", "error"].includes(s.status)) return false;
      if (filter === "problems" && !["warning", "error", "offline"].includes(s.status)) return false;
      if (filter === "offline" && s.status !== "offline") return false;
      if (tag !== "all" && !s.tags.includes(tag)) return false;
      return matchesSearch(s, q);
    });
    return list.sort((a, b) => {
      switch (sortBy) {
        case "gpu": return (b.gpuUtil ?? -1) - (a.gpuUtil ?? -1);
        case "temp": return (b.maxGpuTempC ?? -1) - (a.maxGpuTempC ?? -1);
        case "power": return b.totalPowerW - a.totalPowerW;
        case "name": return a.name.localeCompare(b.name);
        default: return statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name);
      }
    });
  }, [servers, filter, tag, q, sortBy]);

  const counts = useMemo(() => {
    const list = servers ?? [];
    return {
      all: list.length,
      online: list.filter((s) => ["online", "warning", "error"].includes(s.status)).length,
      problems: list.filter((s) => ["warning", "error", "offline"].includes(s.status)).length,
      offline: list.filter((s) => s.status === "offline").length,
    };
  }, [servers]);

  const filters: Array<[StatusFilter, string]> = [["all", "All"], ["online", "Online"], ["problems", "Needs attention"], ["offline", "Offline"]];

  return (
    <div className="bg-background min-h-full">
      <Header title="Dashboard" subtitle="Live overview of your GPU fleet" />
      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Servers online" icon={ServerIcon} tone={stats && stats.offlineServers > 0 ? "warning" : "success"} testId="stat-online"
            value={`${stats?.onlineServers ?? 0}/${stats?.totalServers ?? 0}`}
            sub={stats?.offlineServers ? `${stats.offlineServers} offline` : "All reporting servers are up"} />
          <StatCard label="GPUs" icon={Cpu} testId="stat-total-gpus" value={stats?.totalGpus ?? 0}
            sub={stats?.totalVramGB ? `${stats.totalVramUsedGB} / ${stats.totalVramGB} GB VRAM in use` : "No GPU reported yet"} />
          <StatCard label="Avg GPU utilization" icon={Activity} testId="stat-avg-gpu-util" value={`${stats?.avgGpuUtil ?? 0}%`} sub="Across online GPUs" />
          <StatCard label="Power draw" icon={Zap} testId="stat-total-power" value={`${stats?.totalPowerKW ?? 0} kW`} sub="Current GPU power, online servers" />
          <StatCard label="Active alerts" icon={AlertTriangle} tone={stats?.criticalAlerts ? "danger" : stats?.activeAlerts ? "warning" : "default"} testId="stat-critical-alerts"
            value={stats?.activeAlerts ?? 0}
            sub={`${stats?.criticalAlerts ?? 0} critical · ${stats?.resolvedToday ?? 0} resolved today`} />
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3" data-testid="section-servers">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground mr-2">Servers</h3>
            {filters.map(([key, label]) => (
              <Button key={key} variant={filter === key ? "default" : "ghost"} size="sm" onClick={() => setFilter(key)} data-testid={`filter-${key}`}>
                {label} <span className="ml-1.5 text-xs opacity-70">{counts[key]}</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative lg:hidden">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-48" placeholder="Search…" defaultValue={q} onKeyDown={(e) => {
                if (e.key === "Enter") navigate((e.target as HTMLInputElement).value ? `/?q=${encodeURIComponent((e.target as HTMLInputElement).value)}` : "/");
              }} />
            </div>
            {q && (
              <Button variant="secondary" size="sm" onClick={() => navigate("/")} data-testid="clear-search">
                “{q}” <X className="h-3 w-3 ml-1" />
              </Button>
            )}
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="w-40" data-testid="tag-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44" data-testid="sort-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Sort: problems first</SelectItem>
                <SelectItem value="name">Sort: name</SelectItem>
                <SelectItem value="gpu">Sort: GPU utilization</SelectItem>
                <SelectItem value="temp">Sort: GPU temperature</SelectItem>
                <SelectItem value="power">Sort: power draw</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)
          ) : visible.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <ServerIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              {(servers ?? []).length === 0 ? (
                <>
                  <p className="text-lg font-medium text-foreground">No servers yet</p>
                  <p className="text-muted-foreground mb-4">Add your first GPU server and install the collector on it.</p>
                  {isAdmin && (
                    <Button asChild><Link href="/servers?add=1"><Plus className="h-4 w-4 mr-2" />Add a server</Link></Button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-lg font-medium text-foreground">No server matches these filters</p>
                  <Button variant="link" onClick={() => { setFilter("all"); setTag("all"); navigate("/"); }}>Reset filters</Button>
                </>
              )}
            </div>
          ) : (
            visible.map((server) => <ServerCard key={server.id} server={server} />)
          )}
        </div>

        <Card data-testid="section-alerts">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Active alerts</CardTitle>
            <Button variant="ghost" size="sm" asChild data-testid="view-all-alerts">
              <Link href="/alerts">View all alerts</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAlerts.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No active alerts</div>
            ) : (
              recentAlerts.map((alert) => <AlertItem key={alert.id} alert={alert} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
