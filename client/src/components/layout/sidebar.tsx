import { Link, useLocation } from "wouter";
import { Server, AlertTriangle, Settings, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const [location] = useLocation();
  
  const { data: stats = {} } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  }) as { data: any };

  const { data: alerts = [] } = useQuery({
    queryKey: ["/api/alerts"],
    refetchInterval: 10000,
  }) as { data: any[] };

  const activeAlerts = alerts.filter((alert: any) => !alert.resolvedAt);

  const navItems = [
    { path: "/", icon: TrendingUp, label: "Dashboard" },
    { path: "/alerts", icon: AlertTriangle, label: "Alerts", badge: activeAlerts.length > 0 ? activeAlerts.length : undefined },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border sidebar-transition">
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Server className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground">Server Monitor</h1>
        </div>
      </div>
      
      <nav className="mt-8">
        <div className="px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.path || 
              (item.path !== "/" && location.startsWith(item.path));
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        
        <div className="mt-8 px-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Servers</span>
              <span className="font-medium text-sidebar-foreground" data-testid="stat-total-servers">
                {stats.totalServers || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Online</span>
              <span className="font-medium text-success" data-testid="stat-online-servers">
                {stats.onlineServers || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Alerts</span>
              <span className="font-medium text-warning" data-testid="stat-active-alerts">
                {activeAlerts.length}
              </span>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
