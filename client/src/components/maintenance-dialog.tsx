import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServerView } from "@shared/schema";

// datetime-local wants local time without zone
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS: Array<[string, number]> = [["1 h", 1], ["4 h", 4], ["24 h", 24], ["Custom", 0]];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select one server (from its page) */
  server?: Pick<ServerView, "id" | "name">;
}

export default function MaintenanceDialog({ open, onOpenChange, server }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: servers = [] } = useQuery<ServerView[]>({ queryKey: ["/api/servers"], enabled: open && !server });
  const { data: tags = [] } = useQuery<string[]>({ queryKey: ["/api/tags"], enabled: open && !server });
  const [scope, setScope] = useState("server");
  const [serverId, setServerId] = useState("");
  const [tag, setTag] = useState("");
  const [preset, setPreset] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setScope(server ? "server" : "tag");
    setServerId(server?.id ?? "");
    setTag("");
    setPreset("1");
    setStartsAt(toLocalInput(now));
    setEndsAt(toLocalInput(new Date(now.getTime() + 3600_000)));
    setReason("");
  }, [open, server]);

  const create = useMutation({
    mutationFn: () => {
      const start = preset === "0" ? new Date(startsAt) : new Date();
      const end = preset === "0" ? new Date(endsAt) : new Date(start.getTime() + Number(preset) * 3600_000);
      return apiRequest("POST", "/api/maintenance-windows", {
        serverId: scope === "server" ? serverId : null,
        tag: scope === "tag" ? tag : null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        reason: reason || null,
      });
    },
    onSuccess: () => {
      ["/api/maintenance-windows", "/api/servers", "/api/stats"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Maintenance scheduled", description: "Alerts are muted for the selected servers during the window." });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Could not schedule maintenance", description: e.message, variant: "destructive" }),
  });

  const valid = (scope !== "server" || serverId) && (scope !== "tag" || tag) && (preset !== "0" || (startsAt && endsAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="maintenance-dialog">
        <DialogHeader>
          <DialogTitle>Schedule maintenance{server ? ` for ${server.name}` : ""}</DialogTitle>
          <DialogDescription>Alerts are muted and the servers show “Maintenance” during the window.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          {!server && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Applies to</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger data-testid="maintenance-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tag">Servers with tag…</SelectItem>
                    <SelectItem value="server">One server…</SelectItem>
                    <SelectItem value="all">All servers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {scope === "tag" && (
                <div>
                  <Label>Tag</Label>
                  <Select value={tag} onValueChange={setTag}>
                    <SelectTrigger data-testid="maintenance-tag"><SelectValue placeholder="Choose a tag" /></SelectTrigger>
                    <SelectContent>{tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {scope === "server" && (
                <div>
                  <Label>Server</Label>
                  <Select value={serverId} onValueChange={setServerId}>
                    <SelectTrigger><SelectValue placeholder="Choose a server" /></SelectTrigger>
                    <SelectContent>{servers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Duration (starting now)</Label>
            <ToggleGroup type="single" variant="outline" className="justify-start mt-1" value={preset} onValueChange={(v) => v && setPreset(v)}>
              {PRESETS.map(([label, h]) => <ToggleGroupItem key={h} value={String(h)} className="px-4">{label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>

          {preset === "0" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mw-start">Start</Label>
                <Input id="mw-start" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="mw-end">End</Label>
                <Input id="mw-end" type="datetime-local" required min={startsAt} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="mw-reason">Reason</Label>
            <Input id="mw-reason" maxLength={200} placeholder="Driver upgrade, PSU replacement…" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="maintenance-reason" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || create.isPending} data-testid="submit-maintenance">
              {create.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
