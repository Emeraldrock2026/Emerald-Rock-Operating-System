import { type DateOnly } from "./dates";
import { daysBetween } from "./dashboard";

/** A forecast not updated for this many days is flagged as stale. */
export const STALE_FORECAST_DAYS = 28;
/** Days late beyond which a milestone is red rather than amber. */
export const RED_VARIANCE_DAYS = 14;

export interface Milestone {
  id: string; name: string; baseline_date: DateOnly | null; forecast_date: DateOnly | null;
  actual_date: DateOnly | null; forecast_updated_on: DateOnly | null;
}
export type MilestoneState = "achieved" | "achieved_late" | "on_track" | "forecast_late" | "no_forecast" | "no_baseline";
export interface MilestoneView {
  state: MilestoneState;
  /** Days of (actual or forecast) after baseline; positive is late, null when it cannot be worked out. */
  variance: number | null;
  rag: "red" | "amber" | "green" | "none";
  /** Flags shown beside the milestone; never inferred into a critical-path claim. */
  flags: ("stale_forecast" | "forecast_passed")[];
}

export function milestoneView(m: Milestone, today: DateOnly, staleDays = STALE_FORECAST_DAYS): MilestoneView {
  const flags: MilestoneView["flags"] = [];
  const compare = m.actual_date ?? m.forecast_date;
  const variance = m.baseline_date && compare ? daysBetween(m.baseline_date, compare) : null;
  if (!m.actual_date && m.forecast_date) {
    if (m.forecast_date < today) flags.push("forecast_passed");
    if (!m.forecast_updated_on || daysBetween(m.forecast_updated_on, today) > staleDays) flags.push("stale_forecast");
  }
  let state: MilestoneState;
  if (!m.baseline_date) state = "no_baseline";
  else if (m.actual_date) state = variance! > 0 ? "achieved_late" : "achieved";
  else if (!m.forecast_date) state = "no_forecast";
  else state = variance! > 0 ? "forecast_late" : "on_track";
  const rag = variance === null ? "none" : variance > RED_VARIANCE_DAYS ? "red" : variance > 0 ? "amber" : "green";
  return { state, variance, rag: m.actual_date && rag !== "none" ? (variance! > 0 ? rag : "green") : rag, flags };
}

export const STATE_LABEL: Record<MilestoneState, string> = {
  achieved: "Achieved", achieved_late: "Achieved late", on_track: "Forecast on or before baseline",
  forecast_late: "Forecast after baseline", no_forecast: "Forecast not entered", no_baseline: "No baseline set",
};
export function varianceLabel(v: number | null): string {
  if (v === null) return "Not available";
  if (v === 0) return "On baseline";
  return v > 0 ? `${v} day${v === 1 ? "" : "s"} late` : `${-v} day${v === -1 ? "" : "s"} early`;
}
export function milestoneSummary(ms: readonly Milestone[], today: DateOnly, staleDays = STALE_FORECAST_DAYS) {
  const views = ms.map((m) => milestoneView(m, today, staleDays));
  return {
    total: ms.length,
    achieved: views.filter((v) => v.state === "achieved" || v.state === "achieved_late").length,
    late: views.filter((v) => v.state === "forecast_late").length,
    stale: views.filter((v) => v.flags.includes("stale_forecast")).length,
    noBaseline: views.filter((v) => v.state === "no_baseline").length,
  };
}
