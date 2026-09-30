import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServerView } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this server; create a new one when undefined */
  server?: ServerView;
  onCreated?: (result: { server: ServerView; apiKey: string }) => void;
}

export default function ServerFormDialog({ open, onOpenChange, server, onCreated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", id: "", tags: "", location: "", description: "" });

  useEffect(() => {
    if (open) {
      setForm({
        name: server?.name ?? "",
        id: "",
        tags: server?.tags.join(", ") ?? "",
        location: server?.location ?? "",
        description: server?.description ?? "",
      });
    }
  }, [open, server]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        location: form.location || null,
        description: form.description || null,
        ...(server ? {} : form.id ? { id: form.id } : {}),
      };
      const res = server
        ? await apiRequest("PATCH", `/api/servers/${server.id}`, body)
        : await apiRequest("POST", "/api/servers", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      onOpenChange(false);
      if (server) {
        toast({ title: "Server updated" });
      } else {
        onCreated?.(data);
      }
    },
    onError: (e: Error) => toast({ title: "Could not save server", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="server-form-dialog">
        <DialogHeader>
          <DialogTitle>{server ? `Edit ${server.name}` : "Add a server"}</DialogTitle>
          <DialogDescription>
            {server
              ? "Name, tags and location shown on the dashboard."
              : "A dedicated collector key is generated for this server. You will install the collector on it in the next step."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="srv-name">Name *</Label>
            <Input id="srv-name" required maxLength={100} placeholder="paris-gpu-01" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-server-name" />
          </div>
          {!server && (
            <div>
              <Label htmlFor="srv-id">Identifier</Label>
              <Input id="srv-id" pattern="[A-Za-z0-9._\-]{1,64}" placeholder="derived from the name" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} data-testid="input-server-id" />
              <p className="text-xs text-muted-foreground mt-1">Letters, digits, dots, dashes. Cannot be changed later.</p>
            </div>
          )}
          <div>
            <Label htmlFor="srv-tags">Tags</Label>
            <Input id="srv-tags" placeholder="training, paris, a100" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} data-testid="input-server-tags" />
            <p className="text-xs text-muted-foreground mt-1">Comma separated. Used for filtering and to scope alert rules.</p>
          </div>
          <div>
            <Label htmlFor="srv-location">Location</Label>
            <Input id="srv-location" maxLength={100} placeholder="Rack B3, Paris DC" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="srv-desc">Description</Label>
            <Textarea id="srv-desc" maxLength={500} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !form.name.trim()} data-testid="submit-server">
              {mutation.isPending ? "Saving…" : server ? "Save" : "Create server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
