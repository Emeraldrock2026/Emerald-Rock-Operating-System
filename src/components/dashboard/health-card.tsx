import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getProjectHealth } from "@/lib/health.functions";
import { HEALTH_KEYS, HEALTH_LABELS, weightsSchema, type Evidence, type HealthWeights } from "@/lib/domain/health";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB } from "@/lib/domain/dates";

export function HealthCard({ tenantId, projectId, onOpenRecord, onOpenSection }: { tenantId: string; projectId: string; onOpenRecord: (module: string, id: string) => void; onOpenSection: (section: string) => void }) {
  const fetchHealth = useServerFn(getProjectHealth);
  const qc = useQueryClient();
  const key = ["tenant", tenantId, "project", projectId, "health"];
  const q = useQuery({ queryKey: key, queryFn: () => fetchHealth({ data: { tenantId, projectId } }), staleTime: 0 });
  const [draft, setDraft] = useState<HealthWeights | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const explain = useMutation({ mutationFn: () => fetchHealth({ data: { tenantId, projectId, explain: true } }) });
  const save = useMutation({ mutationFn: async () => {
    const w = weightsSchema.parse(draft);
    const values = { actions_weight: w.actions, milestones_weight: w.milestones, qa_weight: w.qa, commercial_weight: w.commercial };
    if (q.data?.settingsVersion == null) {
      const r = await supabase.from("project_health_settings").insert({ tenant_id: tenantId, project_id: projectId, ...values }); if (r.error) throw r.error;
    } else {
      const r = await supabase.from("project_health_settings").update(values).eq("tenant_id", tenantId).eq("project_id", projectId).eq("version", q.data.settingsVersion).select("project_id");
      if (r.error) throw r.error; if (!r.data?.length) throw new StaleRecordError();
    }
  }, onSuccess: () => { setDraft(null); setSaveError(null); explain.reset(); void qc.invalidateQueries({ queryKey: key }); }, onError: (e) => setSaveError(e instanceof Error ? e.message : friendlyError(e)) });
  const result = explain.data ?? q.data;
  const h = result?.health;
  const open = (e: Evidence) => e.module === "milestones" || e.module === "commercial" ? onOpenSection(e.module) : onOpenRecord(e.module, e.target);
  const refresh = () => { explain.reset(); void q.refetch(); };
  return <section className="border-t py-5" aria-label="Project health">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Project health</h2><div className="flex gap-2">
      {result?.canManage && !draft ? <Button size="sm" variant="outline" onClick={() => setDraft(result.weights)}>Adjust weights</Button> : null}
      <Button size="icon" variant="ghost" aria-label="Refresh health score" disabled={q.isFetching || explain.isPending} onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
    </div></div>
    {q.error ? <p className="mt-2 text-sm text-destructive">{friendlyError(q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Loading health score…</p> : h ? <>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1"><strong className="text-3xl tabular-nums">{h.score == null ? "Not available" : `${h.score}/100`}</strong><span className={h.score == null ? "text-muted-foreground" : h.score >= 80 ? "text-success" : h.score >= 50 ? "text-warning-foreground" : "text-destructive"}>{h.status}</span><span className="text-xs text-muted-foreground">{h.coverage}% weighted coverage · {formatDateGB(h.today)} · Rules v{h.ruleVersion}</span></div>
      {h.provisional ? <p className="mt-2 text-sm text-warning-foreground">Provisional — missing or stale data. This score covers only the information you are authorised to see.</p> : <p className="mt-2 text-xs text-muted-foreground">Based only on enabled modules and records you are authorised to see.</p>}
      {h.critical ? <p className="mt-2 text-sm text-destructive">Critical override: unresolved failed QA or an unachieved milestone over 14 calendar days late caps the score at 49.</p> : null}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{h.dimensions.map((d) => <div key={d.key} className="min-w-0"><dt className="text-sm font-medium">{HEALTH_LABELS[d.key]} <span className="text-xs text-muted-foreground">· weight {d.weight}</span></dt><dd className="tabular-nums">{d.excluded ? "Excluded" : d.weight === 0 ? "Not weighted" : d.score == null ? "Not available" : `${Math.round(d.score)}/100`}</dd>{d.missing.map((m) => <dd key={m} className="mt-1 text-xs text-muted-foreground">{m}</dd>)}</div>)}</dl>
      {draft ? <form className="mt-4" onSubmit={(e) => { e.preventDefault(); setSaveError(null); save.mutate(); }}><div className="grid gap-3 sm:grid-cols-4">{HEALTH_KEYS.map((k) => <div key={k}><Label htmlFor={`weight-${k}`}>{HEALTH_LABELS[k]}</Label><Input id={`weight-${k}`} className="mt-1" type="number" min="0" max="100" step="1" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} /></div>)}</div><p className="mt-2 text-xs text-muted-foreground">Relative weights (0–100); at least one must be positive. Changes are recorded in project history.</p><div className="mt-2 flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>Save weights</Button><Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>Cancel</Button></div>{saveError ? <p className="mt-2 text-sm text-destructive">{saveError}</p> : null}</form> : null}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Scoring rules and limitations</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground"><li>Actions: 100 × share of open dated actions not overdue. Undated actions are flagged, not counted as success.</li><li>Milestones: average of max(0, 100 − positive calendar-day variance × 100/28 − 25 if stale). Actual takes precedence over forecast.</li><li>QA: 100 × passed / explicit passed-or-failed statuses; closed alone is not a pass.</li><li>Commercial: max(0, 100 − adverse variance as a fraction of current budget × 500 − 25 if stale). Revenue shortfalls and cost/expenditure overruns are adverse. Current budget includes adjustments.</li><li>Forecasts over 28 days old, or missing an update date, are stale. Missing dimensions are omitted; remaining weights are normalised. Zero-weight and disabled/restricted dimensions are excluded. Coverage is available weight / applicable positive weight. No available weight means no score.</li><li>Green ≥80; amber 50–79; red &lt;50. Critical overrides apply regardless of weights. Pending change estimates are shown separately, not added to the score. Different access can produce different scores; this is not a prediction or approval.</li></ul></details>
      <h3 className="mt-4 text-sm font-medium">Priority actions</h3>{h.priorities.length ? <ol className="mt-1 space-y-2">{h.priorities.map((e) => <li key={e.id} className="text-sm"><Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => open(e)}>{e.label}</Button><p className="text-xs text-muted-foreground">{e.fact}</p></li>)}</ol> : <p className="mt-1 text-xs text-muted-foreground">{h.score == null ? "Enter the missing inputs before assessing priorities." : "No adverse record-based actions identified."}</p>}
      <div className="mt-4"><Button size="sm" variant="outline" disabled={explain.isPending || h.score == null || !h.evidence.length || q.isFetching} onClick={() => explain.mutate()}><Sparkles className="mr-2 h-4 w-4" />{explain.isPending ? "Writing explanation…" : "Write AI explanation"}</Button><p className="mt-1 text-xs text-muted-foreground">AI interpretation, not a recalculated score; cites up to three authorised records from the 40 highest-priority sources.</p></div>
      {explain.error ? <p className="mt-2 text-sm text-destructive">{friendlyError(explain.error)}</p> : null}
      {result.explanationError ? <p className="mt-2 text-sm text-warning-foreground">{result.explanationError}</p> : null}
      {result.narrative ? <div className="mt-3 space-y-3" aria-label="AI health explanation">{result.narrative.map((p, n) => p.source ? <div key={n}><p className="text-sm"><strong>AI interpretation: </strong>{p.interpretation}</p><Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left text-xs" onClick={() => { if (p.source) open(p.source); }}>Source: {p.source.label}</Button><p className="text-xs text-muted-foreground">Fact: {p.source.fact}</p></div> : null)}</div> : null}
    </> : null}
  </section>;
}