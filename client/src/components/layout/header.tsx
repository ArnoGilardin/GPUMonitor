import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Search, Bell, User, Menu, LogOut, KeyRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useRealtimeState } from "@/hooks/use-realtime";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLayout } from "./layout-context";
import type { AlertView } from "@/components/alert-item";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Header({
  title = "Dashboard",
  subtitle = "Monitor your GPU servers and system performance",
  actions,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { openMobileNav } = useLayout();
  const realtime = useRealtimeState();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (location === "/") setSearch(new URLSearchParams(window.location.search).get("q") ?? "");
  }, [location]);

  const { data: activeAlerts = [] } = useQuery<AlertView[]>({
    queryKey: ["/api/alerts", { status: "active", limit: 20 }],
    refetchInterval: 60000,
  });

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(search.trim() ? `/?q=${encodeURIComponent(search.trim())}` : "/");
  };

  return (
    <header className="bg-card border-b border-border px-4 py-4 md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={openMobileNav} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-bold text-foreground truncate" data-testid="page-title">{title}</h2>
            <p className="text-muted-foreground text-sm mt-0.5 truncate hidden sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {actions}

          <form onSubmit={submitSearch} className="relative hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="search"
              placeholder="Search servers, tags, GPUs…"
              className="pl-10 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="search-input"
            />
          </form>

          <span
            className={cn(
              "hidden md:inline-flex items-center gap-1.5 text-xs",
              realtime === "live" ? "text-success" : "text-muted-foreground",
            )}
            title={realtime === "live" ? "Receiving live updates" : "Live updates disconnected, data refreshes periodically"}
            data-testid="realtime-indicator"
          >
            <span className={cn("w-2 h-2 rounded-full", realtime === "live" ? "bg-success animate-pulse" : "bg-muted-foreground")} />
            {realtime === "live" ? "Live" : realtime === "connecting" ? "Connecting" : "Offline"}
          </span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" data-testid="notifications-button" aria-label="Active alerts">
                <Bell className="h-4 w-4" />
                {activeAlerts.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-error text-[10px] leading-4 text-white">
                    {activeAlerts.length > 9 ? "9+" : activeAlerts.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="px-4 py-3 border-b border-border font-medium">Active alerts</div>
              <div className="max-h-80 overflow-auto">
                {activeAlerts.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No active alerts 🎉</p>
                ) : (
                  activeAlerts.slice(0, 8).map((a) => (
                    <Link key={a.id} href={`/servers/${a.serverId}`} className="block px-4 py-3 border-b border-border last:border-0 hover:bg-accent/50">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className={cn("w-2 h-2 rounded-full", a.level === "critical" ? "bg-error" : "bg-warning")} />
                        {a.server?.name ?? a.serverId}
                        <span className="ml-auto text-xs text-muted-foreground font-normal">{timeAgo(a.firedAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.message}</p>
                    </Link>
                  ))
                )}
              </div>
              <Link href="/alerts" className="block text-center text-sm py-2 border-t border-border text-primary hover:underline">
                View all alerts
              </Link>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2" data-testid="user-menu">
                <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </span>
                <span className="hidden md:inline font-medium" data-testid="user-name">{user?.username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                {user?.username}
                <span className="block text-xs font-normal text-muted-foreground capitalize">{user?.role}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings?tab=account")}>
                <KeyRound className="h-4 w-4 mr-2" /> Change password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} data-testid="logout-button">
                <LogOut className="h-4 w-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
