import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { RequireModule } from "@/components/app/require-module";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { clientsQuery } from "@/lib/projects-data";

export const Route = createFileRoute("/_authenticated/t/$tenantId/clients/")({
  head: () => ({
    meta: [
      { title: "Clients — Emerald Rock OS" },
      { name: "description", content: "The organisations your business works for." },
      { property: "og:title", content: "Clients — Emerald Rock OS" },
      { property: "og:description", content: "The organisations your business works for." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModule module="clients_projects">
      <ClientsPage />
    </RequireModule>
  ),
});

type Client = { id: string; name: string; contact_name: string | null; contact_email: string | null; active: boolean; version: number };

function ClientsPage() {
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const allowed = ctx.access ? can(ctx.access, "clients.view") : false;
  const clients = useQuery({ ...clientsQuery(tenantId), enabled: allowed });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const save = useMutation({
    mutationFn: async (v: { id?: string; version?: number; patch: Partial<Pick<Client, "name" | "contact_name" | "contact_email" | "active">> }) => {
      if (!v.id) {
        const { error } = await supabase.from("clients").insert({ tenant_id: tenantId, name: v.patch.name!, contact_name: v.patch.contact_name ?? null, contact_email: v.patch.contact_email ?? null });
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase.from("clients").update(v.patch).eq("id", v.id).eq("version", v.version!).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Client saved."); setEditing(null); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId] }),
  });

  if (!allowed) return <PageHeader title="Clients" description="You don't have access to clients." />;

  const q = search.trim().toLowerCase();
  const rows = (clients.data ?? []).filter((c) => (showInactive || c.active) && (!q || c.name.toLowerCase().includes(q) || (c.contact_name ?? "").toLowerCase().includes(q)));
  const inactive = (clients.data ?? []).filter((c) => !c.active).length;

  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    const patch = { name: t("name"), contact_name: t("contact_name") || null, contact_email: t("contact_email") || null };
    if (editing === "new") save.mutate({ patch });
    else if (editing) save.mutate({ id: editing.id, version: editing.version, patch });
  };

  return (
    <>
      <PageHeader title="Clients" description="The organisations you work for. Clients are never deleted; mark them inactive instead." actions={<Button onClick={() => setEditing("new")}>Add client</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Search clients" placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {inactive > 0 ? <Button variant="link" className="px-0" onClick={() => setShowInactive((v) => !v)}>{showInactive ? "Hide inactive" : `Show ${inactive} inactive`}</Button> : null}
      </div>
      {clients.error ? <p className="text-sm text-destructive">{friendlyError(clients.error)}</p> : null}
      {clients.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {clients.data && rows.length === 0 ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No clients to show.</p> : null}
      {rows.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    {c.contact_name ?? "—"}
                    {c.contact_email ? <div className="text-xs text-muted-foreground">{c.contact_email}</div> : null}
                  </TableCell>
                  <TableCell><StatusBadge tone={c.active ? "ok" : "off"}>{c.active ? "Active" : "Inactive"}</StatusBadge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                    <Button variant="ghost" size="sm" disabled={save.isPending}
                      onClick={() => window.confirm(c.active ? `Mark ${c.name} inactive? Existing projects are kept, but no new projects can be created for them.` : `Reactivate ${c.name}?`) && save.mutate({ id: c.id, version: c.version, patch: { active: !c.active } })}>
                      {c.active ? "Mark inactive" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Add client" : "Edit client"}</DialogTitle></DialogHeader>
          <form id="client-form" key={editing === "new" ? "new" : editing?.id} onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Client name</Label>
              <Input id="name" name="name" required maxLength={200} defaultValue={editing && editing !== "new" ? editing.name : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_name">Contact name (optional)</Label>
              <Input id="contact_name" name="contact_name" maxLength={200} defaultValue={editing && editing !== "new" ? editing.contact_name ?? "" : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_email">Contact email (optional)</Label>
              <Input id="contact_email" name="contact_email" type="email" defaultValue={editing && editing !== "new" ? editing.contact_email ?? "" : ""} />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="client-form" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save client"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
