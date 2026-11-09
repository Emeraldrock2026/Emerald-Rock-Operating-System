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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { formatDateGB, isDateOnly, todayIn } from "@/lib/domain/dates";
import { checkNewPattern, FROM_START, patternPeriods, weeklyTotal } from "@/lib/domain/working-patterns";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { DAY_LABELS, employeesQuery, linkableMembersQuery, patternsQuery } from "@/lib/people";

export const Route = createFileRoute("/_authenticated/t/$tenantId/people/$employeeId")({
  head: () => ({
    meta: [
      { title: "Person — Emerald Rock OS" },
      { name: "description", content: "Details and effective-dated working hours for one person." },
      { property: "og:title", content: "Person — Emerald Rock OS" },
      { property: "og:description", content: "Details and effective-dated working hours for one person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonPage,
});

const NO_LOGIN = "__none__";

function PersonPage() {
  const { employeeId } = Route.useParams();
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const manage = ctx.access ? can(ctx.access, "employees.manage") : false;
  const isAdmin = ctx.access ? can(ctx.access, "tenant.users.manage") : false;
  const employees = useQuery(employeesQuery(tenantId));
  const patterns = useQuery(patternsQuery(tenantId));
  const members = useQuery({ ...linkableMembersQuery(tenantId), enabled: isAdmin });
  const today = todayIn(ctx.tenant!.timezone);
  const e = employees.data?.find((x) => x.id === employeeId);
  const list = patterns.data?.get(employeeId) ?? [];

  const save = useMutation({
    mutationFn: async (patch: { full_name?: string; job_title?: string; email?: string | null; active?: boolean; user_id?: string | null }) => {
      const { data, error } = await supabase.from("employees").update(patch).eq("id", employeeId).eq("version", e!.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => toast.success("Saved."),
    onError: (err) => toast.error(friendlyError(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId] }),
  });

  if (employees.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!e) {
    return (
      <PageHeader
        title="Person not found"
        description={<>This person doesn't exist in this business or you can't see them. <Link to="/t/$tenantId/people" params={{ tenantId }} className="underline">Back to People</Link></>}
      />
    );
  }

  const submitDetails = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    save.mutate({ full_name: String(f.get("full_name") ?? "").trim(), job_title: String(f.get("job_title") ?? "").trim(), email: email || null });
  };

  const toggleActive = () => {
    const msg = e.active
      ? `Mark ${e.full_name} as inactive? Their history is kept, they can't be given new work, and any work booked from today onwards is flagged for review.`
      : `Reactivate ${e.full_name}?`;
    if (window.confirm(msg)) save.mutate({ active: !e.active });
  };

  return (
    <>
      <PageHeader
        title={e.full_name}
        description={<Link to="/t/$tenantId/people" params={{ tenantId }} className="underline-offset-4 hover:underline">← All people</Link>}
        actions={
          <>
            <StatusBadge tone={e.active ? "ok" : "off"}>{e.active ? "Active" : "Inactive"}</StatusBadge>
            {manage ? (
              <Button variant="outline" onClick={toggleActive} disabled={save.isPending}>
                {e.active ? "Mark inactive" : "Reactivate"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section aria-labelledby="details-h" className="space-y-4">
          <h2 id="details-h" className="text-sm font-semibold">Details</h2>
          <form key={e.version} onSubmit={submitDetails} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" defaultValue={e.full_name} required maxLength={200} disabled={!manage} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job_title">Job title</Label>
              <Input id="job_title" name="job_title" defaultValue={e.job_title} maxLength={200} disabled={!manage} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={e.email ?? ""} disabled={!manage} />
            </div>
            {manage ? <Button type="submit" disabled={save.isPending}>Save details</Button> : null}
          </form>
          {isAdmin ? (
            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="login">Linked login</Label>
              <Select value={e.user_id ?? NO_LOGIN} onValueChange={(v) => save.mutate({ user_id: v === NO_LOGIN ? null : v })}>
                <SelectTrigger id="login"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOGIN}>Not linked</SelectItem>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Linking lets this person see their own hours and, later, their own work.</p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="hours-h" className="space-y-4">
          <h2 id="hours-h" className="text-sm font-semibold">Working hours</h2>
          <p className="text-sm text-muted-foreground">
            Each pattern applies from its start date until the next one begins. Adding a pattern never changes earlier weeks, so past planning stays as it was.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applies</TableHead>
                  {DAY_LABELS.map((d) => <TableHead key={d} className="text-right">{d}</TableHead>)}
                  <TableHead className="text-right">Week</TableHead>
                  {manage ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {patternPeriods(list, today).map((p) => {
                  const id = list.find((x) => x.effectiveFrom === p.effectiveFrom)!.id;
                  return (
                    <TableRow key={id} className={p.current ? "bg-accent/40" : undefined}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {p.effectiveFrom === FROM_START ? "From the start" : `From ${formatDateGB(p.effectiveFrom)}`}
                        {p.until ? ` to ${formatDateGB(p.until)}` : ""}
                        {p.current ? <span className="ml-2 text-xs font-medium text-primary">Current</span> : p.effectiveFrom > today ? <span className="ml-2 text-xs text-muted-foreground">Upcoming</span> : null}
                      </TableCell>
                      {p.hours.map((h, i) => <TableCell key={i} className="text-right font-mono tabular-nums">{h.toFixed(2)}</TableCell>)}
                      <TableCell className="text-right font-mono font-medium tabular-nums">{weeklyTotal(p.hours).toFixed(2)}</TableCell>
                      {manage ? (
                        <TableCell>
                          {p.effectiveFrom > today ? <RemovePattern tenantId={tenantId} id={id} label={formatDateGB(p.effectiveFrom)} /> : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {manage && e.active ? <AddPattern tenantId={tenantId} employeeId={employeeId} existing={list} today={today} current={patternPeriods(list, today).find((p) => p.current)?.hours} /> : null}
        </section>
      </div>
    </>
  );
}

function RemovePattern({ tenantId, id, label }: { tenantId: string; id: string; label: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("working_patterns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Upcoming pattern removed."),
    onError: (err) => toast.error(friendlyError(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "working-patterns"] }),
  });
  return (
    <Button variant="ghost" size="sm" disabled={del.isPending} onClick={() => window.confirm(`Remove the pattern starting ${label}?`) && del.mutate()}>
      Remove
    </Button>
  );
}

function AddPattern({ tenantId, employeeId, existing, today, current }: {
  tenantId: string; employeeId: string; existing: { effectiveFrom: string }[]; today: string; current: readonly number[] | undefined;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(today);
  const [hours, setHours] = useState<string[]>(() => (current ?? [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0]).map((h) => String(h)));
  const add = useMutation({
    mutationFn: async (nums: number[]) => {
      const { error } = await supabase.from("working_patterns").insert({
        tenant_id: tenantId, employee_id: employeeId, effective_from: from,
        mon_hours: nums[0]!, tue_hours: nums[1]!, wed_hours: nums[2]!, thu_hours: nums[3]!, fri_hours: nums[4]!, sat_hours: nums[5]!, sun_hours: nums[6]!,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success(`New working hours apply from ${formatDateGB(from)}.`),
    onError: (err) => toast.error(friendlyError(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "working-patterns"] }),
  });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!isDateOnly(from)) return toast.error("Choose a start date.");
    const nums = hours.map((h) => Number(h));
    const problem = checkNewPattern(existing.map((p) => ({ effectiveFrom: p.effectiveFrom, hours: [0, 0, 0, 0, 0, 0, 0] })), from, nums);
    if (problem === "invalid_hours") return toast.error("Each day must be between 0 and 24 hours.");
    if (problem === "date_taken") return toast.error("There is already a pattern starting on that date.");
    if (from < today && !window.confirm(`${formatDateGB(from)} is in the past. This is only allowed if no work has been booked for this person since then. Continue?`)) return;
    add.mutate(nums);
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">Change working hours from a date</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">Applies from</Label>
          <Input id="from" type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} required className="w-44" />
        </div>
        {DAY_LABELS.map((d, i) => (
          <div key={d} className="space-y-1.5">
            <Label htmlFor={`h-${d}`}>{d}</Label>
            <Input id={`h-${d}`} type="number" inputMode="decimal" min={0} max={24} step={0.25} className="w-20 font-mono"
              value={hours[i]} onChange={(ev) => setHours((hs) => hs.map((h, j) => (j === i ? ev.target.value : h)))} />
          </div>
        ))}
        <Button type="submit" disabled={add.isPending}>{add.isPending ? "Saving…" : "Add pattern"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Week total: {weeklyTotal(hours.map((h) => Number(h) || 0) as never).toFixed(2)} hours</p>
    </form>
  );
}
