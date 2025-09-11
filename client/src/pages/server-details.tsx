import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Copy, Activity, Thermometer, Zap, Fan } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";

export default function ServerDetails() {
  const { id } = useParams();
  const { toast } = useToast();

  const { data: server } = useQuery({
    queryKey: ["/api/servers", id],
    enabled: !!id,
  });

  const { data: metrics } = useQuery({
    queryKey: ["/api/servers", id, "metrics"],
    enabled: !!id,
    refetchInterval: 30000,
  });

  // Real-time updates for this specific server
  useWebSocket({
    serverId: id,
    onMessage: (message) => {
      // Handle real-time server updates
      console.log("Server update:", message);
    },
  });

  if (!server) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const copyDockerCommand = () => {
    const command = `docker run -d --name gpu-collector \\
  -e CENTRAL_API_URL=https://${window.location.host} \\
  -e CENTRAL_API_KEY=collector-key-123 \\
  -e SERVER_ID=${server.id} \\
  --gpus all \\
  gpu-monitor-collector`;
    
    navigator.clipboard.writeText(command);
    toast({
      title: "Copied!",
      description: "Docker command copied to clipboard",
    });
  };

  const mockChartData = Array.from({ length: 20 }, (_, i) => ({
    time: new Date(Date.now() - (19 - i) * 30000).toLocaleTimeString(),
    gpu: Math.random() * 100,
    cpu: Math.random() * 100,
    ram: Math.random() * 100,
    temp: 65 + Math.random() * 20,
    power: 150 + Math.random() * 100,
  }));

  return (
    <div className="bg-background">
      <Header 
        title={server.name}
        subtitle={`${server.id} - ${server.ip || 'Unknown IP'}`}
      />
      
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => history.back()} data-testid="back-button">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="flex items-center space-x-4">
            <Badge variant={server.status === "online" ? "default" : "destructive"}>
              {server.status}
            </Badge>
            <Button onClick={copyDockerCommand} data-testid="copy-docker-command">
              <Copy className="h-4 w-4 mr-2" />
              Copy Collector Command
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* GPU Utilization Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="h-5 w-5 mr-2" />
                GPU Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="gpu" 
                    stroke="hsl(var(--chart-1))" 
                    fill="hsl(var(--chart-1))" 
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* System Resources Chart */}
          <Card>
            <CardHeader>
              <CardTitle>System Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="cpu" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    name="CPU %"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ram" 
                    stroke="hsl(var(--chart-3))" 
                    strokeWidth={2}
                    name="RAM %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Temperature Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Thermometer className="h-5 w-5 mr-2" />
                Temperature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[40, 90]} />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="temp" 
                    stroke="hsl(var(--warning))" 
                    strokeWidth={2}
                    name="Temperature °C"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Power Usage Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Power Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="power" 
                    stroke="hsl(var(--chart-4))" 
                    fill="hsl(var(--chart-4))" 
                    fillOpacity={0.2}
                    name="Power (W)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* GPU Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>GPU Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="gpu-details-table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">GPU</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Model</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Utilization</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">VRAM</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Temperature</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Power</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Fan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {server.gpus?.map((gpu: any, index: number) => (
                    <tr key={index} data-testid={`gpu-row-${index}`}>
                      <td className="p-4 text-sm text-foreground">{index}</td>
                      <td className="p-4 text-sm text-foreground">{gpu.model || "Unknown"}</td>
                      <td className="p-4 text-sm text-foreground">
                        <div className="flex items-center space-x-2">
                          <span>{gpu.utilPercent || 0}%</span>
                          <Progress value={gpu.utilPercent || 0} className="w-16 h-1" />
                        </div>
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        {gpu.vramUsedMB || 0} / {gpu.vramTotalMB || 0} MB
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        <span className={gpu.tempC > 80 ? "text-warning" : "text-foreground"}>
                          {gpu.tempC || 0}°C
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground">{gpu.powerW || 0}W</td>
                      <td className="p-4 text-sm text-foreground">
                        <div className="flex items-center space-x-2">
                          <Fan className="h-3 w-3" />
                          <span>{gpu.fanPercent || 0}%</span>
                        </div>
                      </td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No GPU data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
