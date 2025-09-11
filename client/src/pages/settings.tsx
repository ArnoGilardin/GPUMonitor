import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, Plus, TestTube } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/header";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: rules } = useQuery({
    queryKey: ["/api/rules"],
  });

  const [emailSettings, setEmailSettings] = useState({
    alert_email_to: "",
    webhook_url: "",
  });

  const [newRule, setNewRule] = useState({
    name: "",
    type: "gpu_temp",
    threshold: "",
    durationSec: "120",
    level: "warning",
    enabled: true,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Updated",
        description: "Your settings have been saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/rules", {
        ...data,
        threshold: parseFloat(data.threshold),
        durationSec: parseInt(data.durationSec),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      setNewRule({
        name: "",
        type: "gpu_temp",
        threshold: "",
        durationSec: "120",
        level: "warning",
        enabled: true,
      });
      toast({
        title: "Rule Created",
        description: "Alert rule has been created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create alert rule",
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await apiRequest("DELETE", `/api/rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      toast({
        title: "Rule Deleted",
        description: "Alert rule has been deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete alert rule",
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(emailSettings);
  };

  const handleCreateRule = () => {
    if (!newRule.name || !newRule.threshold) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createRuleMutation.mutate(newRule);
  };

  const testWebhook = async () => {
    try {
      const response = await fetch(emailSettings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          server: "TestTube Server",
          level: "warning",
          message: "TestTube webhook notification",
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        toast({
          title: "Webhook TestTube Successful",
          description: "TestTube notification sent successfully",
        });
      } else {
        throw new Error("Webhook test failed");
      }
    } catch (error) {
      toast({
        title: "Webhook TestTube Failed",
        description: "Failed to send test notification",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-background">
      <Header 
        title="Settings"
        subtitle="Configure monitoring settings and alert rules"
      />
      
      <div className="p-6">
        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList>
            <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
            <TabsTrigger value="alert-rules" data-testid="tab-alert-rules">Alert Rules</TabsTrigger>
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
          </TabsList>

          {/* Notifications Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email-to">Alert Email Recipient</Label>
                    <Input
                      id="email-to"
                      type="email"
                      placeholder="admin@example.com"
                      value={emailSettings.alert_email_to}
                      onChange={(e) => setEmailSettings(prev => ({
                        ...prev,
                        alert_email_to: e.target.value
                      }))}
                      data-testid="input-email-to"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Email address to receive alert notifications
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="webhook-url"
                        placeholder="https://hooks.slack.com/services/..."
                        value={emailSettings.webhook_url}
                        onChange={(e) => setEmailSettings(prev => ({
                          ...prev,
                          webhook_url: e.target.value
                        }))}
                        data-testid="input-webhook-url"
                      />
                      <Button
                        variant="outline"
                        onClick={testWebhook}
                        disabled={!emailSettings.webhook_url}
                        data-testid="test-webhook"
                      >
                        <TestTube className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Webhook URL for Slack, Discord, or other services
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleSaveSettings}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="save-notifications"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alert Rules */}
          <TabsContent value="alert-rules">
            <div className="space-y-6">
              {/* Create New Rule */}
              <Card>
                <CardHeader>
                  <CardTitle>Create Alert Rule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rule-name">Rule Name</Label>
                      <Input
                        id="rule-name"
                        placeholder="High GPU Temperature"
                        value={newRule.name}
                        onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                        data-testid="input-rule-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="rule-type">Metric Type</Label>
                      <select
                        id="rule-type"
                        className="w-full px-3 py-2 bg-background border border-border rounded-md"
                        value={newRule.type}
                        onChange={(e) => setNewRule(prev => ({ ...prev, type: e.target.value }))}
                        data-testid="select-rule-type"
                      >
                        <option value="gpu_temp">GPU Temperature</option>
                        <option value="gpu_util">GPU Utilization</option>
                        <option value="vram_util">VRAM Utilization</option>
                        <option value="cpu_util">CPU Utilization</option>
                        <option value="disk_util">Disk Utilization</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="rule-threshold">Threshold</Label>
                      <Input
                        id="rule-threshold"
                        type="number"
                        placeholder="80"
                        value={newRule.threshold}
                        onChange={(e) => setNewRule(prev => ({ ...prev, threshold: e.target.value }))}
                        data-testid="input-rule-threshold"
                      />
                    </div>

                    <div>
                      <Label htmlFor="rule-duration">Duration (seconds)</Label>
                      <Input
                        id="rule-duration"
                        type="number"
                        placeholder="120"
                        value={newRule.durationSec}
                        onChange={(e) => setNewRule(prev => ({ ...prev, durationSec: e.target.value }))}
                        data-testid="input-rule-duration"
                      />
                    </div>

                    <div>
                      <Label htmlFor="rule-level">Alert Level</Label>
                      <select
                        id="rule-level"
                        className="w-full px-3 py-2 bg-background border border-border rounded-md"
                        value={newRule.level}
                        onChange={(e) => setNewRule(prev => ({ ...prev, level: e.target.value }))}
                        data-testid="select-rule-level"
                      >
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={newRule.enabled}
                        onCheckedChange={(checked) => setNewRule(prev => ({ ...prev, enabled: checked }))}
                        data-testid="switch-rule-enabled"
                      />
                      <Label>Enabled</Label>
                    </div>
                  </div>

                  <Button
                    className="mt-4"
                    onClick={handleCreateRule}
                    disabled={createRuleMutation.isPending}
                    data-testid="create-rule"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {createRuleMutation.isPending ? "Creating..." : "Create Rule"}
                  </Button>
                </CardContent>
              </Card>

              {/* Existing Rules */}
              <Card>
                <CardHeader>
                  <CardTitle>Existing Alert Rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4" data-testid="rules-list">
                    {rules?.map((rule: any) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                        data-testid={`rule-${rule.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-medium text-foreground">{rule.name}</h4>
                            <Badge variant={rule.level === "critical" ? "destructive" : "outline"}>
                              {rule.level}
                            </Badge>
                            {!rule.enabled && (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {rule.type.replace("_", " ").toUpperCase()} > {rule.threshold}
                            {rule.type.includes("temp") ? "°C" : "%"} for {rule.durationSec}s
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteRuleMutation.mutate(rule.id)}
                          disabled={deleteRuleMutation.isPending}
                          data-testid={`delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )) || (
                      <div className="text-center py-8 text-muted-foreground">
                        No alert rules configured
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Data Retention</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Configure how long to keep monitoring data
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Metrics Retention (days)</Label>
                        <Input type="number" defaultValue="30" />
                      </div>
                      <div>
                        <Label>Alerts Retention (days)</Label>
                        <Input type="number" defaultValue="90" />
                      </div>
                      <div>
                        <Label>Logs Retention (days)</Label>
                        <Input type="number" defaultValue="7" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-foreground mb-2">Collection Interval</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      How often collectors should send metrics
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Default Interval (seconds)</Label>
                        <Input type="number" defaultValue="30" />
                      </div>
                      <div>
                        <Label>High Frequency Mode (seconds)</Label>
                        <Input type="number" defaultValue="10" />
                      </div>
                    </div>
                  </div>

                  <Button data-testid="save-general-settings">
                    <Save className="h-4 w-4 mr-2" />
                    Save General Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
