import { createFileRoute, Link } from "@tanstack/react-router";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { projectsQuery } from "@/lib/projects-data";
import { clientDirectoryQuery, clientGroupsQuery, clientContactsQuery, clientFieldOptionsQuery } from "@/lib/client-profile-data";
import { OPTION_FIELDS } from "@/lib/domain/client-fields";
import { liveProjectCount, profileObject } from "@/lib/domain/client-profile";

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
  const clients = useQuery({ ...clientDirectoryQuery(tenantId), enabled: allowed });
  const projects = useQuery({ ...projectsQuery(tenantId), enabled: allowed });
  const groups = useQuery({ ...clientGroupsQuery(tenantId), enabled: allowed });
  const contacts = useQuery({ ...clientContactsQuery(tenantId), enabled: allowed });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const manage = ctx.access ? can(ctx.access, "clients.manage") : false;
  const fieldOptions = useQuery({ ...clientFieldOptionsQuery(tenantId), enabled: allowed && optionsOpen });

  const save = useMutation({
    mutationFn: async (v: { id?: string; version?: number; patch: Partial<Pick<Client, "name" | "contact_name" | "contact_email" | "active">> }) => {
      if (!v.id) {
        const name = v.patch.name;
        if (!name?.trim()) throw new Error("Enter a client name.");
        const { error } = await supabase.from("clients").insert({ tenant_id: tenantId, name, contact_name: v.patch.contact_name ?? null, contact_email: v.patch.contact_email ?? null });
        if (error) throw error;
        return;
      }
      if (v.version === undefined) throw new StaleRecordError();
      const { data, error } = await supabase.from("clients").update(v.patch).eq("tenant_id",tenantId).eq("id", v.id).eq("version", v.version).select("id");
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
      <PageHeader title="Clients" actions={<>{manage ? <Button variant="outline" onClick={() => setOptionsOpen(true)}>Field options</Button> : null}<Button onClick={() => setEditing("new")}>Add client</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Search clients" placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {inactive > 0 ? <Button variant="link" className="px-0" onClick={() => setShowInactive((v) => !v)}>{showInactive ? "Hide inactive" : `Show ${inactive} inactive`}</Button> : null}
      </div>
      {clients.error ? <p className="text-sm text-destructive">{friendlyError(clients.error)}</p> : null}
      {clients.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {clients.data && rows.length === 0 ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No clients to show.</p> : null}
      {rows.length > 0 ? (
        <div className="min-w-0 max-w-full overflow-x-auto border"><Table aria-label="Client spreadsheet"><TableHeader><TableRow>{['Client','Legal entity / group','Reference','Relationship owner','Main contact','Relationship','Identity check','Live projects','Next action','Due','Status'].map(h=><TableHead key={h} className="whitespace-nowrap border-r">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(c=>{const p=profileObject(c.profile);const contact=contacts.data?.find(x=>x.client_id===c.id&&x.active&&x.roles.includes('relationship'));return <TableRow key={c.id}><TableCell className="min-w-48 border-r font-semibold"><Link to="/t/$tenantId/clients/$clientId" params={{tenantId,clientId:c.id}} className="underline-offset-4 hover:underline">{c.name}</Link></TableCell><TableCell className="min-w-48 border-r">{p['legal_name']||'Pending'}<span className="block text-xs text-muted-foreground">{groups.data?.find(g=>g.id===c.group_id)?.name??p['division']}</span></TableCell><TableCell className="whitespace-nowrap border-r font-mono text-xs">{c.display_reference??'Not assigned'}</TableCell><TableCell className="min-w-36 border-r">{p['relationship_owner']||'Pending'}</TableCell><TableCell className="min-w-44 border-r">{contact?.name??c.contact_name??'Pending'}{contact?.email||c.contact_email?<a className="block text-xs underline" href={`mailto:${contact?.email??c.contact_email}`}>{contact?.email??c.contact_email}</a>:null}</TableCell><TableCell className="border-r">{p['relationship_status']??'prospect'}</TableCell><TableCell className="whitespace-nowrap border-r">{c.verified_at?'Evidence recorded':'Unverified'}</TableCell><TableCell className="border-r text-right font-mono">{liveProjectCount((projects.data??[]).filter(x=>x.client_id===c.id))}</TableCell><TableCell className="min-w-44 border-r">{p['next_action']||'Not entered'}</TableCell><TableCell className="whitespace-nowrap border-r">{p['next_action_due']?p['next_action_due'].split('-').reverse().join('/'):'Not entered'}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={save.isPending} onSelect={()=>{if(window.confirm(c.active?`Mark ${c.name} inactive? Existing projects are kept.`:`Reactivate ${c.name}?`))save.mutate({id:c.id,version:c.version,patch:{active:!c.active}});}}>{c.active?'Mark inactive':'Reactivate'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>})}</TableBody></Table></div>
      ) : null}

      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Client field options</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">These lists feed the region, sector and client type pickers. Deactivating an option never removes values already stored on a client.</p>
          {fieldOptions.error ? <p className="text-sm text-destructive">{friendlyError(fieldOptions.error)}</p> : null}
          {OPTION_FIELDS.map(([field, label]) => (
            <section key={field} className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">{label}</h3>
              <ul className="space-y-1">
                {(fieldOptions.data ?? []).filter((o) => o.field === field).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={o.active ? "" : "text-muted-foreground line-through"}>{o.value}</span>
                    <Button variant="link" size="sm" disabled={save.isPending} onClick={() => save.mutate({ option: { id: o.id, version: o.version, active: !o.active } })}>{o.active ? "Deactivate" : "Reactivate"}</Button>
                  </li>
                ))}
              </ul>
              <form className="mt-2 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const v = String(new FormData(ev.currentTarget).get("value") ?? "").trim(); if (v) save.mutate({ option: { field, value: v } }); ev.currentTarget.reset(); }}>
                <Input name="value" required maxLength={120} placeholder={`Add ${label.toLowerCase()} option`} aria-label={`Add ${label} option`} />
                <Button type="submit" variant="outline" disabled={save.isPending}>Add</Button>
              </form>
            </section>
          ))}
        </DialogContent>
      </Dialog>
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
