import { Link, useLocation } from "wouter";
import { Server, AlertTriangle, Settings, LayoutDashboard, Cpu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { FleetStats } from "@shared/schema";

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  const { data: stats } = useQuery<FleetStats>({
    queryKey: ["/api/stats"],
    refetchInterval: 60000,
  });

  const navItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard", testId: "dashboard" },
    { path: "/servers", icon: Server, label: "Servers", testId: "servers", badge: stats?.totalServers },
    {
      path: "/alerts",
      icon: AlertTriangle,
      label: "Alerts",
      testId: "alerts",
      badge: stats?.activeAlerts || undefined,
      badgeClass: stats?.criticalAlerts ? "bg-error text-white" : "bg-warning text-black",
    },
    { path: "/settings", icon: Settings, label: "Settings", testId: "settings" },
  ];

  return (
    <div className="w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Cpu className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground">GPU Monitor</h1>
        </div>
      </div>

      <nav className="mt-4 flex-1">
        <div className="px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onNavigate}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
                data-testid={`nav-${item.testId}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      "ml-auto text-xs px-2 py-0.5 rounded-full",
                      item.badgeClass ?? "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-8 px-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">Fleet</h3>
          <div className="space-y-2 px-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Servers online</span>
              <span className="font-medium text-success" data-testid="stat-online-servers">
                {stats?.onlineServers ?? 0}/{stats?.totalServers ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GPUs</span>
              <span className="font-medium text-sidebar-foreground" data-testid="stat-total-servers">
                {stats?.totalGpus ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active alerts</span>
              <span className={cn("font-medium", stats?.activeAlerts ? "text-warning" : "text-sidebar-foreground")} data-testid="stat-active-alerts">
                {stats?.activeAlerts ?? 0}
              </span>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
