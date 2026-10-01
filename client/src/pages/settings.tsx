import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Trash2, Plus, Send, Pencil, X, CalendarClock } from "lucide-react";
import MaintenanceDialog from "@/components/maintenance-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import Header from "@/components/layout/header";
import { RULE_TYPES, RULE_TYPE_LABELS, type MaintenanceWindow, type Rule, type RuleType, type ServerView } from "@shared/schema";

type SettingsResponse = Record<string, string> & { _server: { emailConfigured: boolean; globalKeyEnabled: boolean } };

function useSaveMutation<T>(fn: (data: T) => Promise<unknown>, invalidate: string[], success: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      invalidate.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: success });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ------------------------------------------------------------ notifications
function NotificationsTab({ settings, readOnly }: { settings?: SettingsResponse; readOnly: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ alert_email_to: "", webhook_url: "", notify_on_resolve: true });

  useEffect(() => {
    if (settings) {
      setForm({
        alert_email_to: settings.alert_email_to ?? "",
        webhook_url: settings.webhook_url ?? "",
        notify_on_resolve: settings.notify_on_resolve !== "false",
      });
    }
  }, [settings]);

  const save = useSaveMutation(() => apiRequest("PATCH", "/api/settings", form), ["/api/settings"], "Notification settings saved");

  const test = async (kind: "webhook" | "email") => {
    try {
      await apiRequest("POST", `/api/settings/test-${kind}`, kind === "webhook" ? { url: form.webhook_url } : { to: form.alert_email_to });
      toast({ title: "Test sent", description: kind === "webhook" ? "Check your channel" : "Check your inbox" });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Where alerts are sent when they fire (and resolve).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-2xl">
        <div>
          <Label htmlFor="email-to">Alert email recipient</Label>
          <div className="flex gap-2">
            <Input id="email-to" type="email" disabled={readOnly} placeholder="ops@example.com" value={form.alert_email_to}
              onChange={(e) => setForm({ ...form, alert_email_to: e.target.value })} data-testid="input-email-to" />
            {!readOnly && (
              <Button variant="outline" onClick={() => test("email")} disabled={!form.alert_email_to || !settings?._server.emailConfigured} title="Send a test email">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {settings?._server.emailConfigured ? "Sent through SendGrid." : "Email is disabled: set SENDGRID_API_KEY on the server to enable it."}
          </p>
        </div>

        <div>
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <div className="flex gap-2">
            <Input id="webhook-url" disabled={readOnly} placeholder="https://hooks.slack.com/services/…" value={form.webhook_url}
              onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} data-testid="input-webhook-url" />
            {!readOnly && (
              <Button variant="outline" onClick={() => test("webhook")} disabled={!form.webhook_url} data-testid="test-webhook" title="Send a test notification">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Slack and Discord webhooks get a formatted message; any other URL receives a JSON payload.</p>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="notify-resolve" disabled={readOnly} checked={form.notify_on_resolve} onCheckedChange={(v) => setForm({ ...form, notify_on_resolve: v })} />
          <Label htmlFor="notify-resolve">Also notify when an alert resolves</Label>
        </div>

        {!readOnly && (
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending} data-testid="save-notifications">
            <Save className="h-4 w-4 mr-2" />{save.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------- rules
const emptyRule = { name: "", type: "gpu_temp" as RuleType, threshold: "", durationSec: "120", level: "warning", enabled: true, scope: "all", serverId: "", tag: "" };

function RulesTab({ readOnly }: { readOnly: boolean }) {
  const { data: rules = [] } = useQuery<Rule[]>({ queryKey: ["/api/rules"] });
  const { data: servers = [] } = useQuery<ServerView[]>({ queryKey: ["/api/servers"] });
  const { data: tags = [] } = useQuery<string[]>({ queryKey: ["/api/tags"] });
  const [form, setForm] = useState(emptyRule);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();

  const toBody = () => ({
    name: form.name,
    type: form.type,
    threshold: Number(form.threshold),
    durationSec: Number(form.durationSec || 0),
    level: form.level,
    enabled: form.enabled,
    serverId: form.scope === "server" ? form.serverId || null : null,
    tag: form.scope === "tag" ? form.tag || null : null,
  });

  const save = useSaveMutation(
    async () => {
      if (editingId) await apiRequest("PATCH", `/api/rules/${editingId}`, toBody());
      else await apiRequest("POST", "/api/rules", toBody());
      setForm(emptyRule);
      setEditingId(null);
    },
    ["/api/rules"],
    editingId ? "Rule updated" : "Rule created",
  );
  const remove = useSaveMutation((id: string) => apiRequest("DELETE", `/api/rules/${id}`), ["/api/rules"], "Rule deleted");
  const toggle = useSaveMutation(({ id, enabled }: { id: string; enabled: boolean }) => apiRequest("PATCH", `/api/rules/${id}`, { enabled }), ["/api/rules"], "Rule updated");

  const edit = (r: Rule) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      type: r.type as RuleType,
      threshold: String(Number(r.threshold)),
      durationSec: String(r.durationSec),
      level: r.level,
      enabled: r.enabled ?? true,
      scope: r.serverId ? "server" : r.tag ? "tag" : "all",
      serverId: r.serverId ?? "",
      tag: r.tag ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    if (!form.name || form.threshold === "") {
      toast({ title: "Name and threshold are required", variant: "destructive" });
      return;
    }
    save.mutate(undefined);
  };

  const isOffline = form.type === "server_offline";
  const scopeLabel = (r: Rule) => (r.serverId ? `server ${servers.find((s) => s.id === r.serverId)?.name ?? r.serverId}` : r.tag ? `tag “${r.tag}”` : "all servers");

  return (
    <div className="space-y-6">
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit alert rule" : "Create alert rule"}</CardTitle>
            <CardDescription>A rule fires when its metric stays at or above the threshold for the whole duration.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="xl:col-span-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input id="rule-name" placeholder="GPU temperature high" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-rule-name" />
              </div>
              <div>
                <Label>Metric</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RuleType })}>
                  <SelectTrigger data-testid="select-rule-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((t) => <SelectItem key={t} value={t}>{RULE_TYPE_LABELS[t].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger data-testid="select-rule-level"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-threshold">{isOffline ? "Silent for (seconds)" : `Threshold ${RULE_TYPE_LABELS[form.type].unit ? `(${RULE_TYPE_LABELS[form.type].unit})` : ""}`}</Label>
                <Input id="rule-threshold" type="number" placeholder={isOffline ? "180" : "80"} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} data-testid="input-rule-threshold" />
              </div>
              {!isOffline && (
                <div>
                  <Label htmlFor="rule-duration">For at least (seconds)</Label>
                  <Input id="rule-duration" type="number" min={0} value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: e.target.value })} data-testid="input-rule-duration" />
                </div>
              )}
              <div>
                <Label>Applies to</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger data-testid="select-rule-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All servers</SelectItem>
                    <SelectItem value="tag">Servers with tag…</SelectItem>
                    <SelectItem value="server">One server…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.scope === "tag" && (
                <div>
                  <Label>Tag</Label>
                  <Select value={form.tag} onValueChange={(v) => setForm({ ...form, tag: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose a tag" /></SelectTrigger>
                    <SelectContent>{tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {form.scope === "server" && (
                <div>
                  <Label>Server</Label>
                  <Select value={form.serverId} onValueChange={(v) => setForm({ ...form, serverId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose a server" /></SelectTrigger>
                    <SelectContent>{servers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} data-testid="switch-rule-enabled" />
                <Label>Enabled</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={submit} disabled={save.isPending} data-testid="create-rule">
                {editingId ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {save.isPending ? "Saving…" : editingId ? "Save rule" : "Create rule"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={() => { setEditingId(null); setForm(emptyRule); }}><X className="h-4 w-4 mr-2" />Cancel</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Alert rules</CardTitle></CardHeader>
        <CardContent className="space-y-3" data-testid="rules-list">
          {rules.length === 0 && <p className="text-center py-8 text-muted-foreground">No alert rules configured</p>}
          {rules.map((rule) => {
            const meta = RULE_TYPE_LABELS[rule.type as RuleType] ?? { label: rule.type, unit: "" };
            return (
              <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border border-border rounded-lg" data-testid={`rule-${rule.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-foreground">{rule.name}</h4>
                    <Badge variant="outline" className={rule.level === "critical" ? "text-error border-error/40" : "text-warning border-warning/40"}>{rule.level}</Badge>
                    {!rule.enabled && <Badge variant="secondary">disabled</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {rule.type === "server_offline"
                      ? `No report for ${Number(rule.threshold)}s`
                      : `${meta.label} ≥ ${Number(rule.threshold)}${meta.unit} for ${rule.durationSec}s`}
                    {" · "}{scopeLabel(rule)}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.enabled ?? true} onCheckedChange={(enabled) => toggle.mutate({ id: rule.id, enabled })} aria-label="Enabled" />
                    <Button variant="ghost" size="icon" onClick={() => edit(rule)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-error" onClick={() => remove.mutate(rule.id)} data-testid={`delete-rule-${rule.id}`} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ general
function GeneralTab({ settings, readOnly }: { settings?: SettingsResponse; readOnly: boolean }) {
  const [form, setForm] = useState({ offline_after_sec: "120", metrics_retention_days: "14", rollup_retention_days: "365", alerts_retention_days: "90" });
  useEffect(() => {
    if (settings) {
      setForm({
        offline_after_sec: settings.offline_after_sec,
        metrics_retention_days: settings.metrics_retention_days,
        rollup_retention_days: settings.rollup_retention_days,
        alerts_retention_days: settings.alerts_retention_days,
      });
    }
  }, [settings]);
  const save = useSaveMutation(() => apiRequest("PATCH", "/api/settings", form), ["/api/settings", "/api/servers"], "Settings saved");

  return (
    <Card>
      <CardHeader><CardTitle>General</CardTitle></CardHeader>
      <CardContent className="space-y-6 max-w-2xl">
        <div>
          <Label>Consider a server offline after (seconds without data)</Label>
          <Input type="number" min={30} disabled={readOnly} value={form.offline_after_sec} onChange={(e) => setForm({ ...form, offline_after_sec: e.target.value })} data-testid="input-offline-after" />
          <p className="text-sm text-muted-foreground mt-1">Should be a few times the collectors' interval (30 s by default).</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Keep raw metrics (days)</Label>
            <Input type="number" min={1} disabled={readOnly} value={form.metrics_retention_days} onChange={(e) => setForm({ ...form, metrics_retention_days: e.target.value })} data-testid="input-raw-retention" />
          </div>
          <div>
            <Label>Keep hourly history (days)</Label>
            <Input type="number" min={7} disabled={readOnly} value={form.rollup_retention_days} onChange={(e) => setForm({ ...form, rollup_retention_days: e.target.value })} data-testid="input-rollup-retention" />
          </div>
          <div>
            <Label>Keep resolved alerts & audit log (days)</Label>
            <Input type="number" min={1} disabled={readOnly} value={form.alerts_retention_days} onChange={(e) => setForm({ ...form, alerts_retention_days: e.target.value })} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Raw samples feed charts up to 48 h; longer ranges use hourly averages, which are tiny. Older data is purged automatically every hour.
        </p>
        {settings && (
          <p className="text-sm text-muted-foreground">
            Global collector key: {settings._server.globalKeyEnabled ? "enabled (servers can auto-register)" : "disabled, only per-server keys are accepted"}.
          </p>
        )}
        {!readOnly && (
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending} data-testid="save-general-settings">
            <Save className="h-4 w-4 mr-2" />{save.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------- maintenance
function MaintenanceTab({ readOnly }: { readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const { data: windows = [] } = useQuery<Array<Omit<MaintenanceWindow, "startsAt" | "endsAt"> & { startsAt: string; endsAt: string }>>({
    queryKey: ["/api/maintenance-windows", { past: showPast ? "true" : undefined }],
  });
  const { data: servers = [] } = useQuery<ServerView[]>({ queryKey: ["/api/servers"] });
  const end = useSaveMutation((id: string) => apiRequest("DELETE", `/api/maintenance-windows/${id}`), ["/api/maintenance-windows", "/api/servers"], "Maintenance window updated");
  const now = Date.now();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Maintenance windows</CardTitle>
          <CardDescription className="mt-1.5">Planned interventions: matching servers show “Maintenance” and raise no alerts.</CardDescription>
        </div>
        {!readOnly && (
          <Button onClick={() => setOpen(true)} data-testid="add-maintenance"><CalendarClock className="h-4 w-4 mr-2" />Schedule</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch id="show-past" checked={showPast} onCheckedChange={setShowPast} />
          <Label htmlFor="show-past">Show past windows</Label>
        </div>
        {windows.length === 0 && <p className="text-center py-8 text-muted-foreground">No maintenance scheduled</p>}
        {windows.map((w) => {
          const start = new Date(w.startsAt).getTime();
          const stop = new Date(w.endsAt).getTime();
          const state = stop < now ? "past" : start <= now ? "active" : "planned";
          const target = w.serverId ? servers.find((s) => s.id === w.serverId)?.name ?? w.serverId : w.tag ? `tag “${w.tag}”` : "all servers";
          return (
            <div key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border border-border rounded-lg" data-testid={`maintenance-${w.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{target}</span>
                  <Badge variant="outline" className={state === "active" ? "text-chart-4 border-chart-4/40" : state === "planned" ? "" : "text-muted-foreground"}>{state}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(w.startsAt).toLocaleString()} → {new Date(w.endsAt).toLocaleString()}
                  {w.reason ? ` · ${w.reason}` : ""}{w.createdBy ? ` · by ${w.createdBy}` : ""}
                </p>
              </div>
              {!readOnly && state !== "past" && (
                <Button variant="outline" size="sm" onClick={() => end.mutate(w.id)} data-testid={`end-maintenance-${w.id}`}>
                  {state === "active" ? "End now" : "Cancel"}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
      <MaintenanceDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}

// -------------------------------------------------------------------- users
function UsersTab() {
  const { user: me } = useAuth();
  const { data: users = [] } = useQuery<Array<{ id: string; username: string; role: string; createdAt: string }>>({ queryKey: ["/api/users"] });
  const [form, setForm] = useState({ username: "", password: "", role: "viewer" });
  const create = useSaveMutation(async () => {
    await apiRequest("POST", "/api/users", form);
    setForm({ username: "", password: "", role: "viewer" });
  }, ["/api/users"], "User created");
  const update = useSaveMutation(({ id, ...body }: { id: string; role?: string; password?: string }) => apiRequest("PATCH", `/api/users/${id}`, body), ["/api/users"], "User updated");
  const remove = useSaveMutation((id: string) => apiRequest("DELETE", `/api/users/${id}`), ["/api/users"], "User deleted");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
          <CardDescription>Viewers can see everything and acknowledge alerts; admins can change configuration.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col md:flex-row gap-3 md:items-end" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
            <div className="flex-1">
              <Label>Username</Label>
              <Input required minLength={3} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} data-testid="input-new-username" />
            </div>
            <div className="flex-1">
              <Label>Password (8+ characters)</Label>
              <Input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-new-password" />
            </div>
            <div className="w-full md:w-36">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={create.isPending} data-testid="create-user"><Plus className="h-4 w-4 mr-2" />Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead><TableHead className="w-40" /></TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.username}`}>
                  <TableCell className="font-medium">{u.username}{u.id === me?.id && <span className="text-muted-foreground font-normal"> (you)</span>}</TableCell>
                  <TableCell>
                    <Select value={u.role} disabled={u.id === me?.id} onValueChange={(role) => update.mutate({ id: u.id, role })}>
                      <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      const password = window.prompt(`New password for ${u.username} (8+ characters)`);
                      if (password) update.mutate({ id: u.id, password });
                    }}>Reset password</Button>
                    {u.id !== me?.id && (
                      <Button variant="ghost" size="icon" className="text-error" onClick={() => window.confirm(`Delete ${u.username}?`) && remove.mutate(u.id)} aria-label="Delete user">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------- audit
function AuditTab() {
  const { data: events = [] } = useQuery<Array<{ id: string; eventType: string; severity: string; username: string | null; ipAddress: string | null; timestamp: string; details: any }>>({
    queryKey: ["/api/audit-log", { limit: 200 }],
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security audit log</CardTitle>
        <CardDescription>Logins, failed attempts, and configuration changes.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Time</TableHead><TableHead>Event</TableHead><TableHead>User</TableHead><TableHead>IP</TableHead><TableHead>Details</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={e.severity === "warning" ? "text-warning border-warning/40" : e.severity === "critical" ? "text-error border-error/40" : ""}>{e.eventType}</Badge>
                </TableCell>
                <TableCell className="text-sm">{e.username ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.ipAddress ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-72 truncate">{e.details ? JSON.stringify(e.details) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ account
function AccountTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => { setForm({ currentPassword: "", newPassword: "", confirm: "" }); toast({ title: "Password changed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4 max-w-sm" onSubmit={(e) => {
          e.preventDefault();
          if (form.newPassword !== form.confirm) return toast({ title: "Passwords do not match", variant: "destructive" });
          save.mutate();
        }}>
          <div><Label>Current password</Label><Input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></div>
          <div><Label>New password</Label><Input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></div>
          <div><Label>Confirm new password</Label><Input type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Change password"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  const searchString = useSearch();
  const initialTab = new URLSearchParams(searchString).get("tab") ?? "notifications";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const { data: settings } = useQuery<SettingsResponse>({ queryKey: ["/api/settings"] });

  return (
    <div className="bg-background min-h-full">
      <Header title="Settings" subtitle={isAdmin ? "Configure notifications, alert rules, retention and users" : "Read-only: ask an administrator to change settings"} />
      <div className="p-4 md:p-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
            <TabsTrigger value="alert-rules" data-testid="tab-alert-rules">Alert rules</TabsTrigger>
            <TabsTrigger value="maintenance" data-testid="tab-maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            {isAdmin && <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>}
            {isAdmin && <TabsTrigger value="audit" data-testid="tab-audit">Audit log</TabsTrigger>}
            <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
          </TabsList>
          <TabsContent value="notifications"><NotificationsTab settings={settings} readOnly={!isAdmin} /></TabsContent>
          <TabsContent value="alert-rules"><RulesTab readOnly={!isAdmin} /></TabsContent>
          <TabsContent value="maintenance"><MaintenanceTab readOnly={!isAdmin} /></TabsContent>
          <TabsContent value="general"><GeneralTab settings={settings} readOnly={!isAdmin} /></TabsContent>
          {isAdmin && <TabsContent value="users"><UsersTab /></TabsContent>}
          {isAdmin && <TabsContent value="audit"><AuditTab /></TabsContent>}
          <TabsContent value="account"><AccountTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
