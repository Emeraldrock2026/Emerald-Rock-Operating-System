import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB, type DateOnly } from "@/lib/domain/dates";
import { commercialForecast, forecastText, formatGBP, parseMoney } from "@/lib/domain/commercial";

interface Props { tenantId: string; projectId: string; canEdit: boolean; changesVisible: boolean; changesEditable: boolean }
type Row = { agreed_fee: number | null; budget_hours: number | null; forecast_final_account: number | null; forecast_updated_on: string | null; forecast_note: string; version: number };
type Change = { id: string; reference: string; title: string; status: string; is_closed: boolean; estimate: number | null; estimateVersion: number | null };

const errText = (e: unknown) => (e instanceof Error && !("code" in e) && !(e instanceof StaleRecordError) ? e.message : friendlyError(e));

export function CommercialForecastCard(p: Props) {
  const qc = useQueryClient();
  const key = ["tenant", p.tenantId, "commercial", p.projectId, "forecast"];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: row, error } = await supabase.from("project_commercials")
        .select("agreed_fee, budget_hours, forecast_final_account, forecast_updated_on, forecast_note, version").eq("project_id", p.projectId).maybeSingle();
      if (error) throw error;
      let changes: Change[] = [];
      if (p.changesVisible) {
        const [recs, ests] = await Promise.all([
          supabase.from("project_records").select("id, reference, title, status, is_closed").eq("project_id", p.projectId).eq("module_id", "change_control").order("reference"),
          supabase.from("change_estimates").select("record_id, amount, version").eq("project_id", p.projectId),
        ]);
        if (recs.error) throw recs.error;
        if (ests.error) throw ests.error;
        const byId = new Map((ests.data ?? []).map((e) => [e.record_id, e]));
        changes = (recs.data ?? []).map((r) => ({ ...r, estimate: byId.get(r.id)?.amount ?? null, estimateVersion: byId.get(r.id)?.version ?? null }));
      }
      return { row: row as Row | null, changes };
    },
  });
  const [editing, setEditing] = useState(false);
  const [fc, setFc] = useState("");
  const [note, setNote] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", p.tenantId, "commercial", p.projectId] });

  const saveForecast = useMutation({
    mutationFn: async () => {
      const v = { forecast_final_account: parseMoney(fc, "Forecast final account"), forecast_note: note.trim() };
      if (v.forecast_final_account != null && v.forecast_final_account < 0) throw new Error("Forecast final account can't be negative.");
      const row = q.data?.row;
      if (!row) {
        const { error } = await supabase.from("project_commercials").insert({ project_id: p.projectId, tenant_id: p.tenantId, ...v });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("project_commercials").update(v).eq("project_id", p.projectId).eq("version", row.version).select("project_id");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      }
    },
    onSuccess: () => { toast.success("Forecast saved."); setEditing(false); },
    onError: (e) => toast.error(errText(e)),
    onSettled: invalidate,
  });
  const saveEstimate = useMutation({
    mutationFn: async ({ c, raw }: { c: Change; raw: string }) => {
      const amount = parseMoney(raw, "Estimate");
      if (amount == null) throw new Error("Enter an estimate. To show it as not estimated, leave the existing value unchanged.");
      if (c.estimateVersion == null) {
        const { error } = await supabase.from("change_estimates").insert({ record_id: c.id, tenant_id: p.tenantId, project_id: p.projectId, amount });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("change_estimates").update({ amount }).eq("record_id", c.id).eq("version", c.estimateVersion).select("record_id");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      }
    },
    onSuccess: () => toast.success("Estimate saved."),
    onError: (e) => toast.error(errText(e)),
    onSettled: invalidate,
  });

  const row = q.data?.row ?? null;
  const f = commercialForecast(row?.agreed_fee ?? null, row?.forecast_final_account ?? null, q.data?.changes ?? []);
  const pending = (q.data?.changes ?? []).filter((c) => !c.is_closed && c.status !== "withdrawn");
  const varTone = f.variance == null ? "text-muted-foreground" : f.variance > 0 ? "text-destructive" : "text-success";

  return (
    <section className="rounded-lg border bg-card p-4" aria-label="Commercial forecast">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Commercial forecast</h2>
          <p className="text-xs text-muted-foreground">Visible only to people with commercial access. Figures are as entered; change estimates are not valuations or entitlements.</p>
        </div>
        {p.canEdit && !editing && !q.isLoading ? (
          <Button size="sm" variant="outline" onClick={() => { setFc(row?.forecast_final_account != null ? String(row.forecast_final_account) : ""); setNote(row?.forecast_note ?? ""); setEditing(true); }}>
            {row?.forecast_final_account != null ? "Update forecast" : "Enter forecast"}
          </Button>
        ) : null}
      </div>
      {q.error ? <p className="mt-2 text-sm text-destructive">{friendlyError(q.error)}</p> : q.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : (
        <>
          {editing ? (
            <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); saveForecast.mutate(); }}>
              <div className="grid gap-1.5"><Label htmlFor="ffa">Forecast final account (£)</Label><Input id="ffa" inputMode="decimal" value={fc} onChange={(e) => setFc(e.target.value)} placeholder="Leave blank if not known" /></div>
              <div className="grid gap-1.5"><Label htmlFor="ffa-note">Basis or note</Label><Input id="ffa-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div className="flex gap-2"><Button type="submit" disabled={saveForecast.isPending}>Save</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
            </form>
          ) : null}
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Budget basis (agreed fee)</dt><dd className="text-lg font-semibold tabular-nums">{row?.agreed_fee != null ? formatGBP(row.agreed_fee) : "Not set"}</dd>
              <dd className="text-xs text-muted-foreground">{row?.budget_hours != null ? `${row.budget_hours.toLocaleString("en-GB")} budget hours` : "Budget hours not set"}</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Forecast final account</dt><dd className="text-lg font-semibold tabular-nums">{forecastText(f.forecast)}</dd>
              <dd className="text-xs text-muted-foreground">{row?.forecast_updated_on ? `Updated ${formatDateGB(row.forecast_updated_on as DateOnly)}` : ""}{row?.forecast_note ? ` · ${row.forecast_note}` : ""}</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Variance to budget</dt>
              <dd className={`text-lg font-semibold tabular-nums ${varTone}`}>{f.variance == null ? "Not available" : `${f.variance > 0 ? "+" : ""}${formatGBP(f.variance)}`}</dd>
              <dd className="text-xs text-muted-foreground">{f.variance == null ? (f.forecast == null ? "Needs a forecast" : "Needs an agreed fee") : `${f.variancePct != null ? `${f.variancePct > 0 ? "+" : ""}${f.variancePct}% · ` : ""}${f.variance > 0 ? "Above budget" : f.variance < 0 ? "Below budget" : "On budget"}`}</dd></div>
            <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Pending change exposure</dt>
              <dd className="text-lg font-semibold tabular-nums">{p.changesVisible ? formatGBP(f.pendingExposure) : "Not available"}</dd>
              <dd className="text-xs text-muted-foreground">{!p.changesVisible ? "Change control is off for this project" : `${f.pendingCount} pending change${f.pendingCount === 1 ? "" : "s"}${f.unestimated ? ` · ${f.unestimated} not estimated` : ""}`}</dd></div>
          </dl>
          {p.changesVisible && f.forecastWithPending != null ? <p className="mt-2 text-xs text-muted-foreground">Forecast plus estimated pending changes: {formatGBP(f.forecastWithPending)}{f.unestimated ? ` (excludes ${f.unestimated} change${f.unestimated === 1 ? "" : "s"} without an estimate)` : ""}.</p> : null}
          {p.changesVisible && pending.length ? (
            <details className="mt-3 rounded-md border p-3 text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Pending changes and estimates ({pending.length})</summary>
              <ul className="mt-2 divide-y">
                {pending.map((c) => <EstimateRow key={c.id} c={c} editable={p.canEdit && p.changesEditable} onSave={(raw) => saveEstimate.mutate({ c, raw })} />)}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function EstimateRow({ c, editable, onSave }: { c: Change; editable: boolean; onSave: (raw: string) => void }) {
  const [v, setV] = useState(c.estimate != null ? String(c.estimate) : "");
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="font-mono text-xs">{c.reference}</span><span className="min-w-0 flex-1">{c.title}</span>
      {editable ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
          <Input aria-label={`Estimate for ${c.reference}`} inputMode="decimal" className="h-8 w-32" value={v} onChange={(e) => setV(e.target.value)} placeholder="Not estimated" />
          <Button size="sm" type="submit" variant="outline">Save</Button>
        </form>
      ) : <span className="text-xs tabular-nums">{c.estimate != null ? formatGBP(c.estimate) : "Not estimated"}</span>}
    </li>
  );
}
