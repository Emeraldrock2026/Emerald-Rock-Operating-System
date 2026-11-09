import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { RequireModule } from "@/components/app/require-module";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { addDays, formatDateGB, todayIn, weekDates, startOfWeek, type DateOnly } from "@/lib/domain/dates";
import { capacityOn, dayFigures, needsOverAllocationConfirmation, sumDays, plannedAllocationPercent, roundHours } from "@/lib/domain/capacity";
import { allocationWarnings, canReceiveAllocations, parseAllocationHours } from "@/lib/domain/planner";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { employeesQuery, patternsQuery, DAY_LABELS } from "@/lib/people";
import { projectsQuery } from "@/lib/projects-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/t/$tenantId/planner")({
  head: () => ({
    meta: [
      { title: "Resource planner — Emerald Rock OS" },
      { name: "description", content: "Weekly planner of daily staff allocations against working hours." },
      { property: "og:title", content: "Resource planner — Emerald Rock OS" },
      { property: "og:description", content: "Weekly planner of daily staff allocations against working hours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModule module="resource_planning">
      <Planner />
    </RequireModule>
  ),
});

type Alloc = { id: string; employee_id: string; project_id: string; allocation_date: string; hours: number; note: string | null; needs_review: boolean; version: number };

function Planner() {
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const manage = ctx.access ? can(ctx.access, "allocations.manage") : false;
  const tz = ctx.tenant?.timezone ?? "Europe/London";
  const today = todayIn(tz);
  const [monday, setMonday] = useState<DateOnly>(startOfWeek(today));
  const days = weekDates(monday);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [cell, setCell] = useState<{ employeeId: string; date: DateOnly } | null>(null);

  const people = useQuery(employeesQuery(tenantId));
  const patterns = useQuery(patternsQuery(tenantId));
  const projects = useQuery(projectsQuery(tenantId));
  const allocKey = ["tenant", tenantId, "allocations", monday];
  const allocs = useQuery({
    queryKey: allocKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("allocations")
        .select("id, employee_id, project_id, allocation_date, hours, note, needs_review, version")
        .eq("tenant_id", tenantId).gte("allocation_date", days[0]!).lte("allocation_date", days[6]!);
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, hours: Number(a.hours) })) as Alloc[];
    },
  });

  const projectById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]);
  const all = allocs.data ?? [];
  const shown = projectFilter ? all.filter((a) => a.project_id === projectFilter) : all;
  const rows = (people.data ?? []).filter((e) =>
    (e.active || all.some((a) => a.employee_id === e.id)) &&
    e.full_name.toLowerCase().includes(search.toLowerCase()) &&
    (!projectFilter || shown.some((a) => a.employee_id === e.id)));

  const figures = (employeeId: string, date: DateOnly) =>
    dayFigures(all.filter((a) => a.employee_id === employeeId && a.allocation_date === date).map((a) => a.hours),
      capacityOn(patterns.data?.get(employeeId) ?? [], date));

  const loading = people.isLoading || patterns.isLoading || projects.isLoading || allocs.isLoading;
  const err = people.error || patterns.error || projects.error || allocs.error;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "allocations"] });

  return (
    <div>
      <PageHeader title={manage ? "Resource planner" : "My work"} description="Planned hours per day against each person's working hours. Leave and holidays aren't included yet." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(startOfWeek(today))}>This week</Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-2 text-sm font-medium">Week of {formatDateGB(monday)}</span>
        </div>
        {manage ? (
          <>
            <div className="grid gap-1"><Label htmlFor="ps" className="text-xs">Person</Label><Input id="ps" className="h-9 w-44" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name" /></div>
            <div className="grid gap-1"><Label htmlFor="pf" className="text-xs">Project</Label>
              <select id="pf" className="h-9 rounded-md border bg-background px-2 text-sm" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">All projects</option>
                {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}
              </select>
            </div>
          </>
        ) : null}
      </div>

      {err ? <p className="text-sm text-destructive">{friendlyError(err)}</p> : loading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{manage ? "No people match." : "Your login isn't linked to a person in this business yet."}</p>
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="p-2 font-medium">Person</th>
                  {days.map((d, i) => <th key={d} scope="col" className={cn("p-2 text-center font-medium", d === today && "bg-accent")}>{DAY_LABELS[i]}<div className="text-xs font-normal text-muted-foreground">{formatDateGB(d).slice(0, 5)}</div></th>)}
                  <th scope="col" className="p-2 text-right font-medium">Week</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const f = days.map((d) => figures(e.id, d));
                  const tot = sumDays(f);
                  const pct = plannedAllocationPercent(tot.allocated, tot.capacity);
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <th scope="row" className="p-2 text-left font-normal"><div className="font-medium">{e.full_name}</div><div className="text-xs text-muted-foreground">{e.active ? e.job_title : "Inactive"}</div></th>
                      {days.map((d, i) => {
                        const x = f[i]!;
                        const review = all.some((a) => a.employee_id === e.id && a.allocation_date === d && a.needs_review);
                        const projHours = projectFilter ? roundHours(shown.filter((a) => a.employee_id === e.id && a.allocation_date === d).reduce((s, a) => s + a.hours, 0)) : null;
                        return (
                          <td key={d} className="p-1 text-center">
                            <button type="button" onClick={() => setCell({ employeeId: e.id, date: d })}
                              aria-label={`${e.full_name}, ${formatDateGB(d)}: ${x.allocated} of ${x.capacity} hours${x.overAllocation ? `, over by ${x.overAllocation}` : ""}`}
                              className={cn("w-full rounded-md border px-1 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                x.overAllocation > 0 ? "border-destructive bg-destructive/10 text-destructive" : x.capacity === 0 ? "text-muted-foreground" : "")}>
                              <span className="font-medium">{projHours ?? x.allocated}</span><span className="text-xs text-muted-foreground"> / {x.capacity}</span>
                              {x.overAllocation > 0 || review ? <AlertTriangle className="mx-auto mt-0.5 h-3 w-3" aria-hidden /> : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="p-2 text-right"><div className={cn("font-medium", tot.overAllocation > 0 && "text-destructive")}>{tot.allocated} / {tot.capacity} h</div><div className="text-xs text-muted-foreground">{pct == null ? "No capacity configured" : `${pct}% planned`}</div></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40">
                  <th scope="row" className="p-2 text-left font-medium">Total</th>
                  {days.map((d) => { const t = sumDays(rows.map((e) => figures(e.id, d))); return <td key={d} className="p-2 text-center text-xs">{t.allocated} / {t.capacity}</td>; })}
                  <td className="p-2 text-right text-xs">{(() => { const t = sumDays(rows.flatMap((e) => days.map((d) => figures(e.id, d)))); return `${t.allocated} / ${t.capacity} h`; })()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Small screen list */}
          <div className="space-y-4 md:hidden">
            {days.map((d, i) => (
              <section key={d} className="rounded-lg border bg-card p-3">
                <h2 className="text-sm font-semibold">{DAY_LABELS[i]} {formatDateGB(d)}</h2>
                <ul className="mt-2 divide-y text-sm">
                  {rows.map((e) => { const x = figures(e.id, d); return (
                    <li key={e.id}><button type="button" className="flex w-full justify-between py-2 text-left" onClick={() => setCell({ employeeId: e.id, date: d })}>
                      <span>{e.full_name}</span><span className={cn(x.overAllocation > 0 && "font-medium text-destructive")}>{x.allocated} / {x.capacity} h{x.overAllocation > 0 ? " · over" : ""}</span>
                    </button></li>); })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {cell ? (
        <CellDialog key={`${cell.employeeId}${cell.date}`} tenantId={tenantId} manage={manage} today={today}
          employee={people.data!.find((e) => e.id === cell.employeeId)!} date={cell.date}
          capacity={capacityOn(patterns.data?.get(cell.employeeId) ?? [], cell.date)}
          items={all.filter((a) => a.employee_id === cell.employeeId && a.allocation_date === cell.date)}
          projects={projects.data ?? []} projectById={projectById}
          onClose={() => setCell(null)} onChanged={invalidate} />
      ) : null}
    </div>
  );
}

type P = { id: string; reference: string; name: string; status: "draft" | "active" | "on_hold" | "completed" | "archived"; start_date: string; planned_finish_date: string };

function CellDialog(props: {
  tenantId: string; manage: boolean; today: DateOnly; employee: { id: string; full_name: string; active: boolean };
  date: DateOnly; capacity: number; items: Alloc[]; projects: P[]; projectById: Map<string, P>;
  onClose: () => void; onChanged: () => void;
}) {
  const { tenantId, manage, employee, date, capacity, items, projectById } = props;
  const [editing, setEditing] = useState<Alloc | "new" | null>(null);
  const [projectId, setProjectId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const allocatable = props.projects.filter((p) => canReceiveAllocations(p.status));
  const fig = dayFigures(items.map((a) => a.hours), capacity);

  const start = (a: Alloc | "new") => {
    setEditing(a);
    setProjectId(a === "new" ? "" : a.project_id);
    setHours(a === "new" ? "" : String(a.hours));
    setNote(a === "new" ? "" : a.note ?? "");
  };

  const save = useMutation({
    mutationFn: async () => {
      const h = parseAllocationHours(hours);
      const p = projectById.get(projectId);
      if (!p) throw new Error("Choose a project.");
      const existing = editing !== "new" ? editing : null;
      const others = items.filter((a) => a.id !== existing?.id).map((a) => a.hours);
      const checks = [...allocationWarnings(p, date)];
      if (needsOverAllocationConfirmation(others, capacity, h, existing?.hours ?? 0)) {
        checks.push(`This puts ${employee.full_name} over their ${capacity} hours on ${formatDateGB(date)} by ${dayFigures([...others, h], capacity).overAllocation} h.`);
      }
      if (checks.length && !window.confirm(`${checks.join("\n")}\n\nBook it anyway?`)) return false;
      if (!existing) {
        const { error } = await supabase.from("allocations").insert({ tenant_id: tenantId, employee_id: employee.id, project_id: p.id, allocation_date: date, hours: h, note: note.trim() || null, client_request_id: crypto.randomUUID() });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("allocations").update({ project_id: p.id, hours: h, note: note.trim() || null, needs_review: false }).eq("id", existing.id).eq("version", existing.version).select("id");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      }
      return true;
    },
    onSuccess: (done) => { if (done) { toast.success("Work saved."); setEditing(null); } },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: props.onChanged,
  });
  const remove = useMutation({
    mutationFn: async (a: Alloc) => {
      const { data, error } = await supabase.from("allocations").delete().eq("id", a.id).eq("version", a.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => toast.success("Work removed."),
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: props.onChanged,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee.full_name} · {formatDateGB(date)}</DialogTitle>
          <DialogDescription>
            {fig.allocated} of {capacity} hours planned{fig.overAllocation > 0 ? ` — over by ${fig.overAllocation} h` : ""}.
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No work booked.</p> : (
          <ul className="divide-y rounded-md border text-sm">
            {items.map((a) => { const p = projectById.get(a.project_id); return (
              <li key={a.id} className="flex items-start justify-between gap-2 p-2">
                <div>
                  <div className="font-medium">{p ? `${p.reference} · ${p.name}` : "Project"} — {a.hours} h</div>
                  {a.note ? <div className="text-xs text-muted-foreground">{a.note}</div> : null}
                  {a.needs_review ? <div className="text-xs text-destructive">Needs review: this person is now inactive.</div> : null}
                </div>
                {manage ? <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => start(a)}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => window.confirm("Remove this work?") && remove.mutate(a)}>Remove</Button>
                </div> : null}
              </li>); })}
          </ul>
        )}
        {manage && !editing ? (
          employee.active ? <Button onClick={() => start("new")}>Add work</Button> : <p className="text-sm text-muted-foreground">This person is inactive and can't be given new work.</p>
        ) : null}
        {manage && editing ? (
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid gap-1.5"><Label htmlFor="ap">Project</Label>
              <select id="ap" required className="h-9 rounded-md border bg-background px-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose a project</option>
                {allocatable.map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}{p.status === "on_hold" ? " (On Hold)" : ""}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="ah">Hours</Label><Input id="ah" inputMode="decimal" required value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 3.5" /></div>
            <div className="grid gap-1.5"><Label htmlFor="an">Note (optional)</Label><Input id="an" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
