import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB, formatTimestamp, todayIn, type DateOnly } from "@/lib/domain/dates";
import { milestoneSummary, milestoneView, STALE_FORECAST_DAYS, STATE_LABEL, varianceLabel, type Milestone } from "@/lib/domain/milestones";

interface Props { tenantId: string; projectId: string; timezone: string; canContribute: boolean; canManage: boolean; historicOnly: boolean; staleDays?: number }
type Row = Milestone & { version: number; notes: string; milestone_baselines: { id: string; baseline_no: number; baseline_date: string; previous_date: string | null; reason: string; set_at: string }[] };

const RAG = { red: "border-destructive/40 bg-destructive/10 text-destructive", amber: "border-warning/50 bg-warning-surface text-warning-foreground", green: "border-success/40 bg-success-surface text-success", none: "border-border text-muted-foreground" };
const d = (v: string | null) => (v ? formatDateGB(v as DateOnly) : "—");

export function MilestonesPanel(p: Props) {
  const qc = useQueryClient();
  const key = ["tenant", p.tenantId, "project", p.projectId, "milestones"];
  const today = todayIn(p.timezone);
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_milestones")
        .select("id, name, baseline_date, forecast_date, actual_date, forecast_updated_on, notes, version, milestone_baselines(id, baseline_no, baseline_date, previous_date, reason, set_at)")
        .eq("project_id", p.projectId).order("sort_order").order("baseline_date", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const [adding, setAdding] = useState(false);
  const [rebase, setRebase] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const editable = p.canContribute && !p.historicOnly;
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const update = useMutation({
    mutationFn: async ({ row, patch }: { row: Row; patch: Partial<Pick<Row, "forecast_date" | "actual_date">> }) => {
      const { data, error } = await supabase.from("project_milestones").update(patch as never).eq("id", row.id).eq("version", row.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => toast.success("Milestone saved."),
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: invalidate,
  });
  const rows = q.data ?? [];
  const staleDays = p.staleDays ?? STALE_FORECAST_DAYS;
  const sum = milestoneSummary(rows, today, staleDays);

  return (
    <section className="rounded-lg border bg-card p-4" aria-label="Milestones">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Milestones</h2>
          <p className="text-xs text-muted-foreground">Variance is the actual date (or forecast, until achieved) compared with the current baseline, in calendar days. These dates are as entered; they are not a programme analysis or a critical-path assessment.</p>
        </div>
        {p.canManage && !p.historicOnly ? <Button size="sm" onClick={() => setAdding(true)}>Add milestone</Button> : null}
      </div>
      {p.historicOnly ? <p className="mb-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">Programmes is switched off for this project. As a project admin you can look at milestones, but nothing can be changed.</p> : null}
      {rows.length ? <p className="mb-2 text-xs text-muted-foreground">{sum.total} milestones · {sum.achieved} achieved · {sum.late} forecast after baseline · {sum.stale} stale forecast{sum.stale === 1 ? "" : "s"} · {sum.noBaseline} without baseline</p> : null}
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : (
        <ul className="divide-y">
          {rows.map((r) => {
            const v = milestoneView(r, today, staleDays);
            const n = r.milestone_baselines.length;
            return (
              <li key={r.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] md:items-center">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${RAG[v.rag]}`}>{STATE_LABEL[v.state]}</span>
                    {v.flags.includes("stale_forecast") ? <span className="rounded border border-warning/50 bg-warning-surface px-1.5 py-0.5 text-[11px] text-warning-foreground">Stale forecast · over {staleDays} days or update date missing</span> : null}
                    {v.flags.includes("forecast_passed") ? <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">Forecast date passed, no actual</span> : null}
                  </div>
                </div>
                <div className="text-xs">
                  <span className="block text-muted-foreground">Baseline{n > 1 ? ` (rev ${n})` : ""}</span>
                  <span className="text-sm">{d(r.baseline_date)}</span>
                  <span className="ml-2 inline-flex gap-1">
                    {n ? <button type="button" className="underline" onClick={() => setHistory(r)}>History</button> : null}
                    {p.canManage && !p.historicOnly ? <button type="button" className="underline" onClick={() => setRebase(r)}>{r.baseline_date ? "Re-baseline" : "Set baseline"}</button> : null}
                  </span>
                </div>
                <DateCell label="Forecast" value={r.forecast_date} editable={editable && !r.actual_date} sub={r.forecast_updated_on ? `updated ${d(r.forecast_updated_on)}` : r.forecast_date ? "" : "Forecast not entered"}
                  onSave={(val) => update.mutate({ row: r, patch: { forecast_date: val } })} />
                <DateCell label="Actual" value={r.actual_date} editable={editable} max={today} onSave={(val) => update.mutate({ row: r, patch: { actual_date: val } })} />
                <div className="text-xs"><span className="block text-muted-foreground">Variance</span><span className="text-sm">{varianceLabel(v.variance)}</span></div>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? <AddDialog {...p} onClose={() => { setAdding(false); void invalidate(); }} /> : null}
      {rebase ? <RebaselineDialog row={rebase} onClose={() => { setRebase(null); void invalidate(); }} /> : null}
      {history ? (
        <Dialog open onOpenChange={(o) => !o && setHistory(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Baseline history · {history.name}</DialogTitle></DialogHeader>
            <ol className="divide-y text-sm">
              {[...history.milestone_baselines].sort((a, b) => b.baseline_no - a.baseline_no).map((b) => (
                <li key={b.id} className="py-2">
                  <p><span className="font-medium">Baseline {b.baseline_no}: {d(b.baseline_date)}</span>{b.previous_date ? <span className="text-muted-foreground"> (was {d(b.previous_date)})</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{b.reason} · {formatTimestamp(b.set_at, p.timezone)}</p>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">Earlier baselines are kept permanently and cannot be edited.</p>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function DateCell({ label, value, editable, sub, max, onSave }: { label: string; value: string | null; editable: boolean; sub?: string; max?: string; onSave: (v: string | null) => void }) {
  return (
    <div className="text-xs">
      <span className="block text-muted-foreground">{label}</span>
      {editable ? (
        <Input type="date" aria-label={label} className="h-8 w-40" defaultValue={value ?? ""} max={max}
          onBlur={(e) => { const nv = e.target.value || null; if (nv !== value) onSave(nv); }} />
      ) : <span className="text-sm">{d(value)}</span>}
      {sub ? <span className="block text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function AddDialog(p: Props & { onClose: () => void }) {
  const [name, setName] = useState("");
  const [baseline, setBaseline] = useState("");
  const [forecast, setForecast] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_milestones").insert({ tenant_id: p.tenantId, project_id: p.projectId, name: name.trim(), baseline_date: baseline || null, forecast_date: forecast || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Milestone added."); p.onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add milestone</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="ms-name">Name</Label><Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="ms-base">Baseline date</Label><Input id="ms-base" type="date" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Recorded as baseline 1. Later changes need Re-baseline with a reason.</p></div>
          <div><Label htmlFor="ms-fc">Forecast date (optional)</Label><Input id="ms-fc" type="date" value={forecast} onChange={(e) => setForecast(e.target.value)} /></div>
          <Button onClick={() => add.mutate()} disabled={!name.trim() || add.isPending}>Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RebaselineDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const [date, setDate] = useState(row.baseline_date ?? "");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_milestone_baseline", { _milestone: row.id, _date: date, _reason: reason, _expected_version: row.version });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Baseline saved. The earlier one is kept in the history."); onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.baseline_date ? "Re-baseline" : "Set baseline"} · {row.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {row.baseline_date ? <p className="text-sm">Current baseline: {d(row.baseline_date)}. It will be kept in the history, not overwritten.</p> : null}
          <div><Label htmlFor="rb-date">New baseline date</Label><Input id="rb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {row.baseline_date ? <div><Label htmlFor="rb-reason">Reason (required)</Label><Textarea id="rb-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div> : null}
          <Button onClick={() => save.mutate()} disabled={!date || (!!row.baseline_date && !reason.trim()) || save.isPending}>Save baseline</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
