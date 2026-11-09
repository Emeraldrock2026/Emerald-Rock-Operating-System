import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/lib/use-tenant";
import { can, type MembershipStatus, type TenantRole } from "@/lib/domain/permissions";
import { formatTimestamp } from "@/lib/domain/dates";
import { MEMBERSHIP_STATUS_LABEL, ROLE_LABEL } from "@/lib/labels";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { inviteMember } from "@/lib/members.functions";

const membersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, user_id, email, role, status, commercial_access, invited_at, activated_at, version")
        .eq("tenant_id", tenantId)
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });

export const Route = createFileRoute("/_authenticated/t/$tenantId/settings/users")({
  head: () => ({
    meta: [
      { title: "Users — Emerald Rock OS" },
      { name: "description", content: "Invite people and manage their access." },
      { property: "og:title", content: "Users — Emerald Rock OS" },
      { property: "og:description", content: "Invite people and manage their access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

const STATUS_TONE: Record<MembershipStatus, "ok" | "pending" | "paused" | "off"> = {
  active: "ok", invited: "pending", suspended: "paused", removed: "off",
};

function UsersPage() {
  const { ctx, tenantId, user } = useTenant();
  const qc = useQueryClient();
  const allowed = ctx.access ? can(ctx.access, "tenant.users.manage") : false;
  const members = useQuery({ ...membersQuery(tenantId), enabled: allowed });
  const commercialOn = ctx.enabledModules.includes("commercial");
  const tz = ctx.tenant!.timezone;

  const update = useMutation({
    mutationFn: async (v: { id: string; version: number; patch: { role?: TenantRole; status?: MembershipStatus; commercial_access?: boolean } }) => {
      const { data, error } = await supabase.from("tenant_memberships").update(v.patch).eq("id", v.id).eq("version", v.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => toast.success("Access updated."),
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "members"] }),
  });

  if (!allowed) {
    return <PageHeader title="Users" description="Only an Owner/Admin can manage users." />;
  }

  const confirmStatus = (id: string, version: number, status: MembershipStatus, email: string) => {
    const verb = status === "suspended" ? "Suspend" : status === "removed" ? "Remove" : "Reactivate";
    if (window.confirm(`${verb} access for ${email}? This takes effect immediately.`)) update.mutate({ id, version, patch: { status } });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Users" description="People with access to this business." actions={<InviteDialog tenantId={tenantId} />} />
      <SettingsTabs />
      {members.isPending ? <p className="text-sm text-muted-foreground">Loading users…</p> : null}
      {members.isError ? <p role="alert" className="text-sm text-destructive">{friendlyError(members.error)}</p> : null}
      {members.data ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead>
                <TableHead>Fee access</TableHead><TableHead>Invited</TableHead><TableHead>Activated</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => {
                const self = m.user_id === user.id;
                const busy = update.isPending;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.email}{self ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}</TableCell>
                    <TableCell>
                      {self || m.status === "removed" ? ROLE_LABEL[m.role] : (
                        <Select value={m.role} disabled={busy} onValueChange={(r) => update.mutate({ id: m.id, version: m.version, patch: { role: r as TenantRole } })}>
                          <SelectTrigger className="h-8 w-44" aria-label={`Role for ${m.email}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ROLE_LABEL) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge tone={STATUS_TONE[m.status]}>{MEMBERSHIP_STATUS_LABEL[m.status]}</StatusBadge></TableCell>
                    <TableCell>
                      {m.role === "owner_admin" ? "Always" : m.role === "employee" ? "Never" : (
                        <span className="flex items-center gap-2">
                          <Switch checked={m.commercial_access} disabled={busy || self} aria-label={`Fee and budget access for ${m.email}`}
                            onCheckedChange={(c) => update.mutate({ id: m.id, version: m.version, patch: { commercial_access: c } })} />
                          {!commercialOn ? <span className="text-xs text-muted-foreground">Module off</span> : null}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatTimestamp(m.invited_at, tz)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{m.activated_at ? formatTimestamp(m.activated_at, tz) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {self ? null : m.status === "active" || m.status === "invited" ? (
                        <>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmStatus(m.id, m.version, "suspended", m.email)}>Suspend</Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmStatus(m.id, m.version, "removed", m.email)}>Remove</Button>
                        </>
                      ) : m.status === "suspended" ? (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmStatus(m.id, m.version, "active", m.email)}>Reactivate</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">Removed people can be invited again. Their past changes stay in the history. If someone didn't get their invitation email, they can use “Forgot your password?” on the sign-in page with the same address.</p>
    </div>
  );
}

function InviteDialog({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteMember);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("employee");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => invite({ data: { tenantId, email, role } }),
    onSuccess: (r) => {
      toast.success(r.emailSent ? `Invitation sent to ${email.trim()}.` : `${email.trim()} already has a login; they'll see this business next time they sign in.`);
      setOpen(false); setEmail(""); setRole("employee"); setError(null);
      qc.invalidateQueries({ queryKey: ["tenant", tenantId, "members"] });
    },
    onError: (e) => setError(friendlyError(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!m.isPending) m.mutate(); };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild><Button>Invite person</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a person</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(r) => setRole(r as TenantRole)}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ROLE_LABEL) as TenantRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={m.isPending || !email.trim()}>{m.isPending ? "Sending…" : "Send invitation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
