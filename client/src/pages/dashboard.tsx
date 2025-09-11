import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cpu, HardDrive, Zap, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import ServerCard from "@/components/server-card";
import ServerModal from "@/components/server-modal";
import AlertItem from "@/components/alert-item";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: servers, refetch: refetchServers } = useQuery({
    queryKey: ["/api/servers"],
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  const { data: alerts } = useQuery({
    queryKey: ["/api/alerts"],
    refetchInterval: 10000,
  });

  // WebSocket for real-time updates
  useWebSocket({
    onMessage: (message) => {
      if (message.type === "update") {
        refetchServers();
      }
    },
    onError: (error) => {
      console.error("WebSocket error:", error);
    },
  });

  const filteredServers = servers?.filter((server: any) => {
    if (filter === "all") return true;
    return server.status === filter;
  }) || [];

  const sortedServers = [...filteredServers].sort((a: any, b: any) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "status":
        return a.status.localeCompare(b.status);
      case "lastSeen":
        return new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime();
      default:
        return 0;
    }
  });

  const activeAlerts = alerts?.filter((alert: any) => !alert.resolvedAt) || [];
  const recentAlerts = alerts?.slice(0, 3) || [];

  const handleRefresh = async () => {
    await refetchServers();
    toast({
      title: "Refreshed",
      description: "Server data has been updated",
    });
  };

  const handleServerClick = (serverId: string) => {
    setSelectedServerId(serverId);
  };

  return (
    <div className="p-6 bg-background">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Total GPUs</p>
                <p className="text-3xl font-bold text-foreground" data-testid="stat-total-gpus">
                  {stats?.totalGpus || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-chart-1/20 rounded-lg flex items-center justify-center">
                <Cpu className="h-6 w-6 text-chart-1" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-success mr-1" />
              <span className="text-success">12%</span>
              <span className="text-muted-foreground ml-1">from last month</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Avg GPU Util</p>
                <p className="text-3xl font-bold text-foreground" data-testid="stat-avg-gpu-util">
                  {stats?.avgGpuUtil || 0}%
                </p>
              </div>
              <div className="w-12 h-12 bg-chart-2/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-chart-2" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-success mr-1" />
              <span className="text-success">5%</span>
              <span className="text-muted-foreground ml-1">from yesterday</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Critical Alerts</p>
                <p className="text-3xl font-bold text-destructive" data-testid="stat-critical-alerts">
                  {activeAlerts.filter((alert: any) => alert.level === "critical").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-destructive/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingDown className="h-4 w-4 text-success mr-1" />
              <span className="text-success">3</span>
              <span className="text-muted-foreground ml-1">resolved today</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Power Usage</p>
                <p className="text-3xl font-bold text-foreground" data-testid="stat-total-power">
                  {stats?.totalPowerKW || 0}kW
                </p>
              </div>
              <div className="w-12 h-12 bg-chart-3/20 rounded-lg flex items-center justify-center">
                <Zap className="h-6 w-6 text-chart-3" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-warning mr-1" />
              <span className="text-warning">8%</span>
              <span className="text-muted-foreground ml-1">from last week</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-foreground">Servers</h3>
          <div className="flex items-center space-x-2">
            <Button
              variant={filter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
              data-testid="filter-all"
            >
              All
            </Button>
            <Button
              variant={filter === "online" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("online")}
              data-testid="filter-online"
            >
              Online
            </Button>
            <Button
              variant={filter === "warning" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("warning")}
              data-testid="filter-warning"
            >
              Warning
            </Button>
            <Button
              variant={filter === "error" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter("error")}
              data-testid="filter-critical"
            >
              Critical
            </Button>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48" data-testid="sort-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by Name</SelectItem>
              <SelectItem value="status">Sort by Status</SelectItem>
              <SelectItem value="lastSeen">Sort by Last Seen</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            data-testid="refresh-servers"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Server Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        {sortedServers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground">No servers found</p>
            <p className="text-muted-foreground">
              {filter === "all" 
                ? "No servers are currently connected"
                : `No servers match the "${filter}" filter`
              }
            </p>
          </div>
        ) : (
          sortedServers.map((server: any) => (
            <ServerCard
              key={server.id}
              server={server}
              onClick={() => handleServerClick(server.id)}
            />
          ))
        )}
      </div>

      {/* Recent Alerts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Alerts</CardTitle>
            <Button variant="ghost" size="sm" asChild data-testid="view-all-alerts">
              <a href="/alerts">View all alerts</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recent alerts
              </div>
            ) : (
              recentAlerts.map((alert: any) => (
                <AlertItem key={alert.id} alert={alert} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Server Details Modal */}
      <ServerModal
        serverId={selectedServerId}
        isOpen={!!selectedServerId}
        onClose={() => setSelectedServerId(null)}
      />
    </div>
  );
}
