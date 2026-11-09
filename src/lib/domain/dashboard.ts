/**
 * Project dashboard metrics (dashboard stage 1). Pure definitions so every card means the same thing
 * everywhere and is tested once. Dates are date-only strings in the business time zone.
 */
import { addDays, startOfWeek, type DateOnly } from "./dates";

export type PeriodKind = "this_week" | "this_month" | "last_month" | "custom";
export interface Period { kind: PeriodKind; from: DateOnly; to: DateOnly }
export const PERIOD_LABEL: Record<PeriodKind, string> = { this_week: "This week", this_month: "This month", last_month: "Last month", custom: "Custom" };
/** Items due within this many days (and not overdue) count as "due soon". */
export const DUE_SOON_DAYS = 7;

/** Inclusive date range. Weeks start on Monday. Custom ranges are returned in order, or null if invalid. */
export function periodRange(kind: PeriodKind, today: DateOnly, custom?: { from: DateOnly; to: DateOnly }): Period | null {
  const monthStart = today.slice(0, 8) + "01";
  switch (kind) {
    case "this_week": { const from = startOfWeek(today); return { kind, from, to: addDays(from, 6) }; }
    case "this_month": return { kind, from: monthStart, to: addDays(nextMonth(monthStart), -1) };
    case "last_month": { const to = addDays(monthStart, -1); return { kind, from: to.slice(0, 8) + "01", to }; }
    case "custom": {
      if (!custom?.from || !custom?.to) return null;
      return custom.from <= custom.to ? { kind, ...custom } : { kind, from: custom.to, to: custom.from };
    }
  }
}
function nextMonth(first: DateOnly): DateOnly {
  const y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
export const inPeriod = (d: DateOnly | null, p: Period) => !!d && d >= p.from && d <= p.to;

export interface DashboardRecord {
  id: string; reference: string; title: string; module_id: string; status: string; is_closed: boolean;
  due_date: DateOnly | null; created_on: DateOnly; closed_on: DateOnly | null;
}
export type Rag = "red" | "amber" | "green";
export interface ModuleKpi { module_id: string; open: number; overdue: number; dueSoon: number; raised: number; closed: number; rag: Rag }

/** Red if anything overdue, amber if anything due soon, otherwise green. */
export function ragFor(overdue: number, dueSoon: number): Rag { return overdue > 0 ? "red" : dueSoon > 0 ? "amber" : "green"; }

export function dueState(r: Pick<DashboardRecord, "is_closed" | "due_date">, today: DateOnly): "overdue" | "due_soon" | "ok" | "none" {
  if (r.is_closed || !r.due_date) return "none";
  if (r.due_date < today) return "overdue";
  return r.due_date <= addDays(today, DUE_SOON_DAYS) ? "due_soon" : "ok";
}

/**
 * One card per visible module, in the order given. Records from modules not in `visibleModules`
 * (switched off, or not permitted) are ignored, so a card never counts what the person can't open.
 */
export function moduleKpis(records: readonly DashboardRecord[], visibleModules: readonly string[], period: Period, today: DateOnly): ModuleKpi[] {
  return visibleModules.map((module_id) => {
    const rs = records.filter((r) => r.module_id === module_id);
    let open = 0, overdue = 0, dueSoon = 0, raised = 0, closed = 0;
    for (const r of rs) {
      if (!r.is_closed) open++;
      const s = dueState(r, today);
      if (s === "overdue") overdue++; else if (s === "due_soon") dueSoon++;
      if (inPeriod(r.created_on, period)) raised++;
      if (r.is_closed && inPeriod(r.closed_on, period)) closed++;
    }
    return { module_id, open, overdue, dueSoon, raised, closed, rag: ragFor(overdue, dueSoon) };
  });
}

/** Open items from visible modules: overdue first, then by due date, undated last, then reference. */
export function consolidatedActions(records: readonly DashboardRecord[], visibleModules: readonly string[], today: DateOnly) {
  const visible = new Set(visibleModules);
  return records
    .filter((r) => !r.is_closed && visible.has(r.module_id))
    .map((r) => ({ ...r, state: dueState(r, today) }))
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || a.reference.localeCompare(b.reference));
}

/* ---------- Charts (dashboard stage 2) ---------- */
export interface OpenClosed { module_id: string; open: number; closed: number }
/** Current open and closed totals per visible module (not period-limited). */
export function openClosedByModule(records: readonly DashboardRecord[], visibleModules: readonly string[]): OpenClosed[] {
  return visibleModules.map((module_id) => {
    const rs = records.filter((r) => r.module_id === module_id);
    const closed = rs.filter((r) => r.is_closed).length;
    return { module_id, open: rs.length - closed, closed };
  });
}

export interface WeekBucket { week: DateOnly; raised: number; closed: number }
/** Monday-start weeks overlapping the period; counts raised and closed records of visible modules by week. */
export function weeklyTrend(records: readonly DashboardRecord[], visibleModules: readonly string[], period: Period): WeekBucket[] {
  const visible = new Set(visibleModules);
  const weeks: WeekBucket[] = [];
  for (let w = startOfWeek(period.from); w <= period.to && weeks.length < 60; w = addDays(w, 7)) weeks.push({ week: w, raised: 0, closed: 0 });
  const idx = (d: DateOnly) => weeks.findIndex((b) => b.week === startOfWeek(d));
  for (const r of records) {
    if (!visible.has(r.module_id)) continue;
    if (inPeriod(r.created_on, period)) { const i = idx(r.created_on); if (i >= 0) weeks[i].raised++; }
    if (r.is_closed && inPeriod(r.closed_on, period)) { const i = idx(r.closed_on!); if (i >= 0) weeks[i].closed++; }
  }
  return weeks;
}

export type Segment =
  | { kind: "status"; module_id: string; closed: boolean }
  | { kind: "week"; week: DateOnly; series: "raised" | "closed" };
/** The exact records behind a chart segment, so click-through always matches the bar. */
export function segmentRecords(records: readonly DashboardRecord[], visibleModules: readonly string[], period: Period, seg: Segment): DashboardRecord[] {
  const visible = new Set(visibleModules);
  return records.filter((r) => {
    if (!visible.has(r.module_id)) return false;
    if (seg.kind === "status") return r.module_id === seg.module_id && r.is_closed === seg.closed;
    const d = seg.series === "raised" ? r.created_on : r.is_closed ? r.closed_on : null;
    return !!d && inPeriod(d, period) && startOfWeek(d) === seg.week;
  }).sort((a, b) => a.reference.localeCompare(b.reference));
}
