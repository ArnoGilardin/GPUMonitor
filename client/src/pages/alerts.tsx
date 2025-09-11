import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Plus } from "lucide-react";
import AlertItem from "@/components/alert-item";
import Header from "@/components/layout/header";

export default function Alerts() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const { data: alerts = [] } = useQuery({
    queryKey: ["/api/alerts"],
    refetchInterval: 10000,
  });

  const filteredAlerts = alerts.filter((alert: any) => {
    // Filter by resolved status
    if (!showResolved && alert.resolvedAt) return false;
    if (showResolved && !alert.resolvedAt) return false;
    
    // Filter by level
    if (filter !== "all" && alert.level !== filter) return false;
    
    // Filter by search term
    if (search && !alert.message.toLowerCase().includes(search.toLowerCase()) && 
        !alert.server?.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const alertStats = {
    total: alerts.length,
    active: alerts.filter((a: any) => !a.resolvedAt).length,
    critical: alerts.filter((a: any) => !a.resolvedAt && a.level === "critical").length,
    warning: alerts.filter((a: any) => !a.resolvedAt && a.level === "warning").length,
  };

  return (
    <div className="bg-background">
      <Header 
        title="Alerts"
        subtitle="Monitor and manage system alerts"
      />
      
      <div className="p-6">
        {/* Alert Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{alertStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Alerts</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{alertStats.active}</p>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{alertStats.critical}</p>
                <p className="text-sm text-muted-foreground">Critical</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-warning">{alertStats.warning}</p>
                <p className="text-sm text-muted-foreground">Warning</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Controls */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Alert Management</CardTitle>
              <Button data-testid="create-rule-button">
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search alerts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="search-alerts"
                />
              </div>
              
              {/* Level Filter */}
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40" data-testid="filter-level">
                  <SelectValue placeholder="Filter by level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Show Resolved Toggle */}
              <div className="flex items-center space-x-2">
                <Button
                  variant={showResolved ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowResolved(!showResolved)}
                  data-testid="toggle-resolved"
                >
                  {showResolved ? "Show Active" : "Show Resolved"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {showResolved ? "Resolved Alerts" : "Active Alerts"} 
                <Badge variant="outline" className="ml-2">
                  {filteredAlerts.length}
                </Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4" data-testid="alerts-list">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-foreground">No alerts found</p>
                  <p className="text-muted-foreground">
                    {showResolved 
                      ? "No resolved alerts match your filters"
                      : "No active alerts match your filters"
                    }
                  </p>
                </div>
              ) : (
                filteredAlerts.map((alert: any) => (
                  <AlertItem key={alert.id} alert={alert} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
