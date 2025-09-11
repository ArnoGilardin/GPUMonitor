import { Search, Bell, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export default function Header({ 
  title = "Dashboard", 
  subtitle = "Monitor your GPU servers and system performance" 
}: HeaderProps) {
  const { user, logout } = useAuth();
  
  const { data: alerts } = useQuery({
    queryKey: ["/api/alerts"],
    refetchInterval: 10000,
  });

  const activeAlerts = alerts?.filter((alert: any) => !alert.resolvedAt) || [];

  return (
    <header className="bg-card border-b border-border p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search servers..."
              className="pl-10 w-64"
              data-testid="search-input"
            />
          </div>
          
          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="notifications-button"
          >
            <Bell className="h-4 w-4" />
            {activeAlerts.length > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-3 w-3 p-0 flex items-center justify-center text-xs"
              >
                {activeAlerts.length > 9 ? "9+" : activeAlerts.length}
              </Badge>
            )}
          </Button>
          
          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-foreground font-medium" data-testid="user-name">
              {user?.username || "Admin User"}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={logout}
              data-testid="logout-button"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
