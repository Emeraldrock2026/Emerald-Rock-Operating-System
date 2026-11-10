import { z } from "zod";
import { daysBetween, type DashboardRecord } from "./dashboard";
import { milestoneView, type Milestone } from "./milestones";
import { type BasisForecast } from "./commercial";

export const HEALTH_KEYS = ["actions", "milestones", "qa", "commercial"] as const;
export type HealthKey = typeof HEALTH_KEYS[number];
export const HEALTH_LABELS: Record<HealthKey, string> = { actions: "Dated actions", milestones: "Milestones", qa: "QA results", commercial: "Commercial forecast" };
export const DEFAULT_WEIGHTS = { actions: 30, milestones: 30, qa: 20, commercial: 20 };
export const weightsSchema = z.object({ actions: z.number().int().min(0).max(100), milestones: z.number().int().min(0).max(100), qa: z.number().int().min(0).max(100), commercial: z.number().int().min(0).max(100) }).refine((w) => Object.values(w).some((v) => v > 0), "At least one weight must be positive.");
export type HealthWeights = z.infer<typeof weightsSchema>;
export interface Evidence { id: string; label: string; module: string; target: string; fact: string; priority: number }
export interface HealthInput { today: string; modules: string[]; records: DashboardRecord[]; milestones: Milestone[] | null; commercial: (BasisForecast & { updatedOn: string | null }) | null; weights: HealthWeights; projectId: string; projectReference: string; freshness?: { milestones: number; commercial: number } }
export interface HealthDimension { key: HealthKey; score: number | null; weight: number; missing: string[]; excluded: boolean }
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Version 1: weighted available scores; missing never scores as zero or as success. */
export function projectHealth(i: HealthInput) {
  const weights = weightsSchema.parse(i.weights);
  const freshness = i.freshness ?? { milestones: 28, commercial: 28 };
  const evidence: Evidence[] = [];
  const dimensions: HealthDimension[] = [];
  let critical = false;
  const add = (key: HealthKey, score: number | null, missing: string[], excluded = false) => dimensions.push({ key, score: score == null ? null : clamp(score), weight: weights[key], missing, excluded });
  const records = i.records.filter((r) => i.modules.includes(r.module_id));
  const open = records.filter((r) => !r.is_closed);
  const dated = open.filter((r) => r.due_date != null);
  const overdue = dated.filter((r) => r.due_date != null && r.due_date < i.today);
  add("actions", dated.length ? 100 * (1 - overdue.length / dated.length) : null,
    [...(!dated.length ? ["No open dated actions"] : []), ...(open.length > dated.length ? [`${open.length - dated.length} open actions have no due date`] : [])], !i.modules.length);
  for (const r of overdue) evidence.push({ id: r.id, label: r.reference, module: r.module_id, target: r.id, fact: `Open action due ${r.due_date}: ${r.title}`, priority: 80 });
  if (i.milestones == null) add("milestones", null, ["Programmes is switched off"], true);
  else {
    const views = i.milestones.map((m) => ({ m, v: milestoneView(m, i.today, freshness.milestones) }));
    const usable = views.filter(({ v }) => v.variance != null);
    const missing = views.filter(({ v }) => v.variance == null).length;
    const stale = views.filter(({ v }) => v.flags.includes("stale_forecast")).length;
    add("milestones", usable.length ? usable.reduce((s, { v }) => s + clamp(100 - Math.max(0, v.variance ?? 0) * 100 / 28 - (v.flags.includes("stale_forecast") ? 25 : 0)), 0) / usable.length : null,
      [...(!views.length ? ["No milestones entered"] : []), ...(missing ? [`${missing} milestones lack a baseline or forecast/actual date`] : []), ...(stale ? [`${stale} forecasts are stale (over ${freshness.milestones} days or update date missing)`] : [])]);
    for (const { m, v } of views) {
      if ((v.variance ?? 0) > 14 && !m.actual_date) critical = true;
      evidence.push({ id: m.id, label: m.name, module: "milestones", target: m.id, fact: `Baseline ${m.baseline_date ?? "missing"}; forecast ${m.forecast_date ?? "missing"}; actual ${m.actual_date ?? "missing"}; variance ${v.variance ?? "not available"} calendar days; flags ${v.flags.join(", ") || "none"}.`, priority: v.variance == null || v.flags.length ? 90 : (v.variance ?? 0) > 14 ? 100 : (v.variance ?? 0) > 0 ? 85 : 0 });
    }
  }
  const qa = records.filter((r) => r.module_id === "qa");
  const results = qa.filter((r) => r.status === "passed" || r.status === "failed");
  const failed = results.filter((r) => r.status === "failed");
  if (i.modules.includes("qa")) {
    add("qa", results.length ? 100 * (1 - failed.length / results.length) : null, [...(!results.length ? ["No explicit QA pass/fail results"] : []), ...(qa.length > results.length ? [`${qa.length - results.length} QA records have no explicit pass/fail status`] : [])]);
    if (failed.some((r) => !r.is_closed)) critical = true;
    for (const r of results) evidence.push({ id: r.id, label: r.reference, module: "qa", target: r.id, fact: `QA status ${r.status}: ${r.title}`, priority: r.status === "failed" ? 100 : 0 });
  } else add("qa", null, ["QA is switched off"], true);
  if (i.commercial == null) add("commercial", null, ["Commercial figures are restricted or the module is switched off"], true);
  else {
    const c = i.commercial;
    const adverse = c.direction === "adverse" ? Math.abs(c.variance ?? 0) : 0;
    const pct = c.budget != null && c.budget > 0 ? adverse / c.budget : null;
    const stale = !c.updatedOn || daysBetween(c.updatedOn, i.today) > freshness.commercial;
    add("commercial", c.forecast == null || pct == null ? null : clamp(100 - pct * 500 - (stale ? 25 : 0)),
      [...(c.forecast == null ? ["Forecast not entered"] : []), ...(c.budget == null || c.budget <= 0 ? ["Positive current budget needed for percentage comparison"] : []), ...(c.forecast != null && stale ? [`Commercial forecast is stale (over ${freshness.commercial} days or update date missing)`] : []), ...(c.unestimated ? [`${c.unestimated} pending changes are not estimated`] : [])]);
    evidence.push({ id: `commercial:${i.projectId}`, label: `${i.projectReference} commercial forecast`, module: "commercial", target: i.projectId, fact: `${c.basis} basis; current budget ${c.budget ?? "not entered"} GBP; forecast ${c.forecast ?? "not entered"} GBP; variance ${c.variance ?? "not available"} GBP (${c.direction ?? "not available"}); pending estimated exposure ${c.pendingExposure} GBP; ${c.unestimated} unestimated changes.`, priority: c.forecast == null || stale ? 90 : adverse ? 85 : 0 });
  }
  const applicable = dimensions.filter((d) => !d.excluded && d.weight > 0);
  const available = applicable.filter((d) => d.score != null);
  const totalWeight = applicable.reduce((s, d) => s + d.weight, 0);
  const usedWeight = available.reduce((s, d) => s + d.weight, 0);
  const raw = usedWeight ? Math.round(available.reduce((s, d) => s + (d.score ?? 0) * d.weight, 0) / usedWeight) : null;
  const score = raw == null ? null : critical ? Math.min(49, raw) : raw;
  const coverage = totalWeight ? Math.round(100 * usedWeight / totalWeight) : 0;
  const sources = evidence.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
  return { ruleVersion: "1", today: i.today, score, raw, coverage, critical, status: score == null ? "Not available" : score >= 80 ? "Green — on track" : score >= 50 ? "Amber — attention needed" : "Red — action needed", provisional: coverage < 100 || applicable.some((d) => d.missing.length > 0), dimensions, evidence: sources, priorities: sources.filter((e) => e.priority > 0).slice(0, 3) };
}

export const narrativeSchema = z.object({ points: z.array(z.object({ evidenceId: z.string(), interpretation: z.string().min(1).max(600) })).min(1).max(3) });
/** Reject the whole narrative if any citation does not belong to this authorised snapshot. */
export function validateNarrative(raw: unknown, evidence: Evidence[]) {
  const parsed = narrativeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.points.some((p) => !evidence.some((e) => e.id === p.evidenceId))) return null;
  return parsed.data.points.map((p) => ({ interpretation: p.interpretation, source: evidence.find((e) => e.id === p.evidenceId) })).filter((p) => p.source != null);
}