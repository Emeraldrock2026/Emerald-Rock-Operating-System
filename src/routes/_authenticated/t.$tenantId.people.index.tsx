import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { capacityOn } from "@/lib/domain/capacity";
import { weekDates, todayIn } from "@/lib/domain/dates";
import { friendlyError } from "@/lib/db-errors";
import { employeesQuery, patternsQuery } from "@/lib/people";

export const Route = createFileRoute("/_authenticated/t/$tenantId/people/")({
  head: () => ({
    meta: [
      { title: "People — Emerald Rock OS" },
      { name: "description", content: "Employee directory and weekly working hours." },
      { property: "og:title", content: "People — Emerald Rock OS" },
      { property: "og:description", content: "Employee directory and weekly working hours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const { ctx, tenantId } = useTenant();
  const manage = ctx.access ? can(ctx.access, "employees.manage") : false;
  const viewAll = ctx.access ? can(ctx.access, "employees.view_all") : false;
  const employees = useQuery(employeesQuery(tenantId));
  const patterns = useQuery(patternsQuery(tenantId));
  const [showInactive, setShowInactive] = useState(false);
  const today = todayIn(ctx.tenant!.timezone);
  const week = weekDates(today);

  const rows = (employees.data ?? []).filter((e) => showInactive || e.active);
  const inactiveCount = (employees.data ?? []).filter((e) => !e.active).length;

  return (
    <>
      <PageHeader
        title={viewAll ? "People" : "My hours"}
        description={viewAll ? "Everyone who can be planned, with this week's working hours." : "Your record and working hours."}
        actions={manage ? <AddEmployee tenantId={tenantId} /> : null}
      />
      {employees.error ? <p className="text-sm text-destructive">{friendlyError(employees.error)}</p> : null}
      {employees.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {employees.data && rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          {viewAll ? "No people yet." : "You aren't linked to an employee record yet. Ask your Owner/Admin."}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Job title</TableHead>
                <TableHead className="text-right">Hours this week</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const p = patterns.data?.get(e.id) ?? [];
                const hours = week.reduce((s, d) => s + capacityOn(p, d), 0);
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link to="/t/$tenantId/people/$employeeId" params={{ tenantId, employeeId: e.id }} className="font-medium text-primary underline-offset-4 hover:underline">
                        {e.full_name}
                      </Link>
                      {e.email ? <div className="text-xs text-muted-foreground">{e.email}</div> : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{e.job_title || "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{patterns.data ? hours.toFixed(2) : "…"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={e.active ? "ok" : "off"}>{e.active ? "Active" : "Inactive"}</StatusBadge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {viewAll && inactiveCount > 0 ? (
        <Button variant="link" className="mt-2 px-0" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Hide inactive people" : `Show ${inactiveCount} inactive`}
        </Button>
      ) : null}
    </>
  );
}

function AddEmployee({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const add = useMutation({
    mutationFn: async (v: { full_name: string; job_title: string; email: string | null }) => {
      const { error } = await supabase.from("employees").insert({ tenant_id: tenantId, ...v });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Person added with the business's standard working week.");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    add.mutate({ full_name: String(f.get("full_name") ?? "").trim(), job_title: String(f.get("job_title") ?? "").trim(), email: email || null });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add person</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <form id="add-employee" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job_title">Job title</Label>
            <Input id="job_title" name="job_title" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" name="email" type="email" />
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-employee" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
