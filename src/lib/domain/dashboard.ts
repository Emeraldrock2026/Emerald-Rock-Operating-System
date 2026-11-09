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
    if (inPeriod(r.created_on, period)) { const i = idx(r.created_on); const b = weeks[i]; if (b) b.raised++; }
    if (r.is_closed && inPeriod(r.closed_on, period)) { const i = idx(r.closed_on!); const b = weeks[i]; if (b) b.closed++; }
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

/* ---------- Ageing, events and QA (dashboard stage 2, part 2) ---------- */
export const AGE_BUCKETS = [
  { id: "0_7", label: "0–7 days", min: 0, max: 7 },
  { id: "8_30", label: "8–30 days", min: 8, max: 30 },
  { id: "31_60", label: "31–60 days", min: 31, max: 60 },
  { id: "61_plus", label: "Over 60 days", min: 61, max: Infinity },
] as const;
export type AgeBucketId = (typeof AGE_BUCKETS)[number]["id"];
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
/** Age of an open record in whole days since it was raised (never negative). */
export function ageBucket(created: DateOnly, today: DateOnly): AgeBucketId {
  const d = Math.max(0, daysBetween(created, today));
  return AGE_BUCKETS.find((b) => d >= b.min && d <= b.max)!.id;
}
/** Open records of visible modules counted by age, as of today. */
export function ageingCounts(records: readonly DashboardRecord[], visibleModules: readonly string[], today: DateOnly): Record<AgeBucketId, number> {
  const out = { "0_7": 0, "8_30": 0, "31_60": 0, "61_plus": 0 } as Record<AgeBucketId, number>;
  const visible = new Set(visibleModules);
  for (const r of records) if (!r.is_closed && visible.has(r.module_id)) out[ageBucket(r.created_on, today)]++;
  return out;
}

/** A dated event (photo uploaded, report issued) that links to one item. */
export interface DashEvent { id: string; on: DateOnly; module_id: string; target_id: string; label: string }
export function weeklyEventCounts(events: readonly DashEvent[], period: Period): { week: DateOnly; count: number }[] {
  const weeks: { week: DateOnly; count: number }[] = [];
  for (let w = startOfWeek(period.from); w <= period.to && weeks.length < 60; w = addDays(w, 7)) weeks.push({ week: w, count: 0 });
  for (const e of events) {
    if (!inPeriod(e.on, period)) continue;
    const b = weeks.find((x) => x.week === startOfWeek(e.on));
    if (b) b.count++;
  }
  return weeks;
}

export const QA_RESULTS = ["open", "passed", "failed", "closed"] as const;
export type QaResult = (typeof QA_RESULTS)[number];
/** QA inspections by current status. Closed is kept separate: closing does not itself say pass or fail. */
export function qaResultCounts(records: readonly DashboardRecord[]): Record<QaResult, number> {
  const out = { open: 0, passed: 0, failed: 0, closed: 0 };
  for (const r of records) if (r.module_id === "qa" && (QA_RESULTS as readonly string[]).includes(r.status)) out[r.status as QaResult]++;
  return out;
}

export type RecordSegment =
  | Segment
  | { kind: "age"; bucket: AgeBucketId }
  | { kind: "qa"; status: QaResult };
export function recordSegment(records: readonly DashboardRecord[], visibleModules: readonly string[], period: Period, today: DateOnly, seg: RecordSegment): DashboardRecord[] {
  if (seg.kind === "status" || seg.kind === "week") return segmentRecords(records, visibleModules, period, seg);
  const visible = new Set(visibleModules);
  return records.filter((r) => visible.has(r.module_id) && (seg.kind === "age"
    ? !r.is_closed && ageBucket(r.created_on, today) === seg.bucket
    : r.module_id === "qa" && r.status === seg.status)).sort((a, b) => a.reference.localeCompare(b.reference));
}
