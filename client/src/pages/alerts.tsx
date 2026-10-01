import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, BellOff, Settings2 } from "lucide-react";
import AlertItem, { type AlertView } from "@/components/alert-item";
import Header from "@/components/layout/header";
import { useAuth } from "@/lib/auth";

type Status = "active" | "resolved" | "all";

export default function Alerts() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<Status>("active");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");

  const { data: alerts = [] } = useQuery<AlertView[]>({ queryKey: ["/api/alerts", { status, limit: 500 }], refetchInterval: 60000 });
  const { data: active = [] } = useQuery<AlertView[]>({ queryKey: ["/api/alerts", { status: "active", limit: 500 }], refetchInterval: 60000 });

  const filtered = useMemo(() => alerts.filter((a) => {
    if (level !== "all" && a.level !== level) return false;
    if (search) {
      const q = search.toLowerCase();
      return [a.message, a.server?.name, a.rule?.name, a.serverId].some((v) => v?.toLowerCase().includes(q));
    }
    return true;
  }), [alerts, level, search]);

  const stats = {
    active: active.length,
    critical: active.filter((a) => a.level === "critical").length,
    warning: active.filter((a) => a.level === "warning").length,
    unacked: active.filter((a) => !a.acknowledgedAt).length,
  };

  return (
    <div className="bg-background min-h-full">
      <Header
        title="Alerts"
        subtitle="Alerts fire when a rule's condition holds for its duration and resolve automatically when it clears"
        actions={isAdmin && (
          <Button variant="outline" asChild data-testid="create-rule-button">
            <Link href="/settings?tab=alert-rules"><Settings2 className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Alert rules</span></Link>
          </Button>
        )}
      />

      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Active", stats.active, "text-foreground"],
            ["Critical", stats.critical, "text-error"],
            ["Warning", stats.warning, "text-warning"],
            ["Not acknowledged", stats.unacked, "text-foreground"],
          ].map(([label, value, cls]) => (
            <Card key={label as string}>
              <CardContent className="p-5 text-center">
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                Alerts <Badge variant="outline">{filtered.length}</Badge>
              </CardTitle>
              <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
                <TabsList>
                  <TabsTrigger value="active" data-testid="tab-active">Active</TabsTrigger>
                  <TabsTrigger value="resolved" data-testid="toggle-resolved">Resolved</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input placeholder="Search by server, rule or message…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" data-testid="search-alerts" />
              </div>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-40" data-testid="filter-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="alerts-list">
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground">No alerts</p>
                  <p className="text-muted-foreground">{status === "active" ? "Everything looks healthy." : "Nothing matches these filters."}</p>
                </div>
              ) : (
                filtered.map((alert) => <AlertItem key={alert.id} alert={alert} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
