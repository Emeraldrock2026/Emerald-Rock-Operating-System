import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RequireModule } from "@/components/app/require-module";
import { PageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { REGISTERS, REGISTER_MODULES } from "@/lib/domain/registers";
import { HEALTH_KEYS, HEALTH_LABELS } from "@/lib/domain/health";
import { dashboardSettingsSchema, WIDGETS, WIDGET_LABELS, TONES, type DashboardSettings, type Widget } from "@/lib/domain/dashboard-settings";
import { dashboardSettingsQuery } from "@/lib/dashboard-settings-data";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";

export const Route = createFileRoute("/_authenticated/t/$tenantId/settings/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard settings — Emerald Rock OS" },
    { name: "description", content: "Business dashboard widgets, status colours, health weights and forecast freshness." },
    { property: "og:title", content: "Dashboard settings — Emerald Rock OS" },
    { property: "og:description", content: "Business dashboard widgets, status colours, health weights and forecast freshness." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <RequireModule module="clients_projects"><DashboardSettingsPage /></RequireModule>,
});

function DashboardSettingsPage() {
  const { tenantId, ctx } = useTenant();
  const admin = ctx.access ? can(ctx.access, "tenant.settings.manage") : false;
  const q = useQuery({ ...dashboardSettingsQuery(tenantId), enabled: admin });
  return <><SettingsTabs /><PageHeader title="Dashboard settings" />{!admin ? <p>Only an Owner/Admin can change business dashboard settings.</p> : q.error ? <p className="text-destructive">{friendlyError(q.error)}</p> : q.data ? <SettingsForm key={`${tenantId}:${q.data.version}`} initial={q.data.config} version={q.data.version} /> : <p>Loading…</p>}</>;
}

function SettingsForm({ initial, version }: { initial: DashboardSettings; version: number | null }) {
  const { tenantId, ctx } = useTenant();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const move = (widget: Widget, delta: number) => {
    const widgets = [...draft.widgets]; const at = widgets.indexOf(widget); const other = widgets[at + delta];
    if (!other) return;
    widgets[at] = other; widgets[at + delta] = widget; setDraft({ ...draft, widgets });
  };
  const save = useMutation({ mutationFn: async () => {
    const config = dashboardSettingsSchema.parse(draft);
    if (version == null) { const r = await supabase.from("tenant_dashboard_settings").insert({ tenant_id: tenantId, config }); if (r.error) throw r.error; }
    else { const r = await supabase.from("tenant_dashboard_settings").update({ config }).eq("tenant_id", tenantId).eq("version", version).select("tenant_id"); if (r.error) throw r.error; if (!r.data?.length) throw new StaleRecordError(); }
  }, onSuccess: async () => { toast.success("Dashboard settings saved."); await qc.invalidateQueries({ queryKey: ["tenant", tenantId] }); }, onError: (e) => setError(e instanceof Error ? e.message : friendlyError(e)) });
  const mappings = [
    ...REGISTER_MODULES.map((m) => ({ id: m, label: REGISTERS[m].label, statuses: REGISTERS[m].statuses })),
    { id: "change_control", label: "Change register", statuses: ["draft", "withdrawn"] },
    ...["progress_reports", "delay_reports"].map((m) => ({ id: m, label: m === "progress_reports" ? "Progress reports" : "Delay reports", statuses: ["draft", "issued", "closed"] })),
  ].filter((m) => [...(ctx.access?.enabledModules ?? [])].some((id) => id === m.id));
  return <form className="max-w-4xl space-y-6" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
    <section className="border-t pt-4"><h2 className="font-semibold">Widgets and order</h2><ul className="mt-3 divide-y">
      {[...draft.widgets, ...WIDGETS.filter((w) => !draft.widgets.includes(w))].map((w) => { const at = draft.widgets.indexOf(w); return <li key={w} className="flex items-center gap-3 py-2"><Switch id={`widget-${w}`} checked={at >= 0} onCheckedChange={(on) => setDraft({ ...draft, widgets: on ? [...draft.widgets, w] : draft.widgets.filter((x) => x !== w) })} /><Label className="flex-1" htmlFor={`widget-${w}`}>{WIDGET_LABELS[w]}</Label><Button type="button" size="icon" variant="ghost" title={`Move ${WIDGET_LABELS[w]} up`} aria-label={`Move ${WIDGET_LABELS[w]} up`} disabled={at <= 0} onClick={() => move(w, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={`Move ${WIDGET_LABELS[w]} down`} aria-label={`Move ${WIDGET_LABELS[w]} down`} disabled={at < 0 || at === draft.widgets.length - 1} onClick={() => move(w, 1)}><ArrowDown className="h-4 w-4" /></Button></li>; })}
    </ul></section>
    <section className="border-t pt-4"><h2 className="font-semibold">Default health weights</h2><div className="mt-3 grid gap-3 sm:grid-cols-4">{HEALTH_KEYS.map((k) => <div key={k}><Label htmlFor={`default-${k}`}>{HEALTH_LABELS[k]}</Label><Input id={`default-${k}`} type="number" min={0} max={100} step={1} value={draft.weights[k]} onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [k]: Number(e.target.value) } })} /></div>)}</div></section>
    <section className="border-t pt-4"><h2 className="font-semibold">Forecast freshness (calendar days)</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["milestones", "commercial"] as const).map((k) => <div key={k}><Label htmlFor={`freshness-${k}`}>{k === "milestones" ? "Milestone forecast freshness" : "Commercial forecast freshness"}</Label><Input id={`freshness-${k}`} type="number" min={1} max={365} step={1} value={draft.freshness[k]} onChange={(e) => setDraft({ ...draft, freshness: { ...draft.freshness, [k]: Number(e.target.value) } })} /></div>)}</div></section>
    <section className="border-t pt-4"><h2 className="font-semibold">Register status colours</h2><div className="mt-3 space-y-3">{mappings.map((m) => <details key={m.id} className="border-b pb-3"><summary className="cursor-pointer text-sm font-medium">{m.label}</summary><div className="mt-2 grid gap-3 sm:grid-cols-3">{m.statuses.map((s) => <div key={s}><Label htmlFor={`mapping-${m.id}-${s}`} className="capitalize">{s.replaceAll("_", " ")}</Label><select id={`mapping-${m.id}-${s}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.statusMappings[m.id]?.[s] ?? ""} onChange={(e) => { const module = { ...draft.statusMappings[m.id] }; const tone = TONES.find((t) => t === e.target.value); if (tone) module[s] = tone; else delete module[s]; setDraft({ ...draft, statusMappings: { ...draft.statusMappings, [m.id]: module } }); }}><option value="">Default</option>{TONES.map((t) => <option key={t} value={t}>{t === "red" ? "Red — action" : t === "amber" ? "Amber — attention" : t === "green" ? "Green — on track" : "Neutral"}</option>)}</select></div>)}</div></details>)}</div></section>
    <details className="border-t pt-4"><summary className="cursor-pointer font-medium">How these settings affect dashboards</summary><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Widgets appear in this order across the business. Hidden widgets do not delete records or change health calculations. Permissions and business/project module switches always take precedence.</li><li>Business weights apply unless a project admin has saved project weights. Existing project weights are preserved. “Use business weights” restores live inheritance. Weights are relative, 0–100, with at least one positive.</li><li>A forecast becomes stale after more than the selected number of calendar days; a missing update date is also stale. The milestone flags, commercial warning and health freshness deductions use these same thresholds.</li><li>Status colours apply to labelled statuses in dashboard actions. They never change open/closed counts, QA pass/fail, approvals, overdue warnings or the critical health override.</li><li>Changes are audited and apply on the next dashboard load or refresh. Missing data stays missing; no setting grants access to restricted commercial figures.</li></ul></details>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save dashboard settings"}</Button>
  </form>;
}