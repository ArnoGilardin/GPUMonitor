import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, KeyRound, Wrench, Server as ServerIcon } from "lucide-react";
import Header from "@/components/layout/header";
import ServerFormDialog from "@/components/server-form-dialog";
import InstallInstructionsDialog from "@/components/install-instructions";
import { StatusBadge } from "@/components/status";
import { matchesSearch } from "@/pages/dashboard";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { timeAgo } from "@/lib/format";
import type { ServerView } from "@shared/schema";

export function useServerActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [install, setInstall] = useState<{ serverId: string; serverName: string; apiKey: string } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/servers/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Server deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const rotate = useMutation({
    mutationFn: async (server: ServerView) => {
      const res = await apiRequest("POST", `/api/servers/${server.id}/rotate-key`);
      return { server, ...(await res.json()) };
    },
    onSuccess: (data) => {
      invalidate();
      setInstall({ serverId: data.server.id, serverName: data.server.name, apiKey: data.apiKey });
    },
    onError: (e: Error) => toast({ title: "Key rotation failed", description: e.message, variant: "destructive" }),
  });

  const maintenance = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => apiRequest("PATCH", `/api/servers/${id}`, { maintenance: on }),
    onSuccess: (_d, v) => { invalidate(); toast({ title: v.on ? "Maintenance mode on" : "Maintenance mode off", description: v.on ? "Alerts are muted for this server" : undefined }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return { remove, rotate, maintenance, install, setInstall };
}

export default function Servers() {
  const { isAdmin } = useAuth();
  const searchString = useSearch();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServerView | undefined>();
  const [deleting, setDeleting] = useState<ServerView | null>(null);
  const [rotating, setRotating] = useState<ServerView | null>(null);
  const actions = useServerActions();

  useEffect(() => {
    if (isAdmin && new URLSearchParams(searchString).get("add")) {
      setEditing(undefined);
      setFormOpen(true);
    }
  }, [searchString, isAdmin]);

  const { data: servers, isLoading } = useQuery<ServerView[]>({ queryKey: ["/api/servers"], refetchInterval: 60000 });
  const list = useMemo(() => (servers ?? []).filter((s) => matchesSearch(s, search)), [servers, search]);

  return (
    <div className="bg-background min-h-full">
      <Header
        title="Servers"
        subtitle="Register GPU servers, manage collector keys and maintenance"
        actions={isAdmin && (
          <Button onClick={() => { setEditing(undefined); setFormOpen(true); }} data-testid="add-server">
            <Plus className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Add server</span>
          </Button>
        )}
      />
      <div className="p-4 md:p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Filter by name, tag, hostname, GPU…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="servers-search" />
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table data-testid="servers-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Host</TableHead>
                  <TableHead>GPUs</TableHead>
                  <TableHead className="hidden md:table-cell">Tags</TableHead>
                  <TableHead className="hidden md:table-cell">Collector key</TableHead>
                  <TableHead>Last seen</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6" /></TableCell></TableRow>
                ))}
                {!isLoading && list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <ServerIcon className="h-10 w-10 mx-auto mb-3" />
                      {servers?.length ? "No server matches this filter" : "No servers yet. Add one, or start a collector with the global key to auto-register it."}
                    </TableCell>
                  </TableRow>
                )}
                {list.map((s) => (
                  <TableRow key={s.id} data-testid={`server-row-${s.id}`}>
                    <TableCell>
                      <Link href={`/servers/${s.id}`} className="font-medium text-foreground hover:underline">{s.name}</Link>
                      <div className="text-xs text-muted-foreground">{s.id}{s.location ? ` · ${s.location}` : ""}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      <div>{s.hostname ?? "—"}{s.ip ? ` (${s.ip})` : ""}</div>
                      <div className="truncate max-w-56">{s.os ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.gpuCount > 0 ? (
                        <span title={Array.from(new Set(s.gpus.map((g) => g.name))).join(", ")}>
                          {s.gpuCount}× <span className="text-muted-foreground text-xs">{s.gpus[0]?.name.replace(/^NVIDIA /, "")}</span>
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">{s.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>)}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                      {s.hasOwnKey ? `${s.apiKeyPrefix}…` : <span className="font-sans">global key</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(s.lastSeenAt)}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`server-actions-${s.id}`} aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditing(s); setFormOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => actions.maintenance.mutate({ id: s.id, on: !s.maintenance })}>
                              <Wrench className="h-4 w-4 mr-2" />{s.maintenance ? "End maintenance" : "Start maintenance"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setRotating(s)}><KeyRound className="h-4 w-4 mr-2" />{s.hasOwnKey ? "Rotate collector key" : "Generate dedicated key"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-error focus:text-error" onClick={() => setDeleting(s)} data-testid={`delete-server-${s.id}`}>
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ServerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        server={editing}
        onCreated={({ server, apiKey }) => actions.setInstall({ serverId: server.id, serverName: server.name, apiKey })}
      />

      {actions.install && (
        <InstallInstructionsDialog open onOpenChange={(o) => !o && actions.setInstall(null)} {...actions.install} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All its metrics and alerts are deleted. If its collector is still running with the global key, the server will register itself again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleting && actions.remove.mutate(deleting.id)} data-testid="confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotating} onOpenChange={(o) => !o && setRotating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rotating?.hasOwnKey ? "Rotate" : "Generate"} the collector key of {rotating?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {rotating?.hasOwnKey
                ? "The current key stops working immediately. Update the collector configuration with the new key."
                : "Once the server has a dedicated key, the global key is refused for it. Update its collector with the new key."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotating && actions.rotate.mutate(rotating)}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
