import { addDays, type DateOnly } from "./dates";
import { roundHours, type WeeklyHours, type WorkingPattern } from "./capacity";

/** Stored first pattern date meaning "from the start". */
export const FROM_START: DateOnly = "2000-01-01";

export function weeklyTotal(hours: WeeklyHours): number {
  return roundHours(hours.reduce((s, h) => s + h, 0));
}

export interface PatternPeriod extends WorkingPattern {
  /** Last day this pattern applies, or null when it is still current. */
  until: DateOnly | null;
  current: boolean;
}

/** Orders patterns newest first and works out when each one stops applying. */
export function patternPeriods(patterns: readonly WorkingPattern[], today: DateOnly): PatternPeriod[] {
  const asc = [...patterns].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const out = asc.map((p, i) => {
    const next = asc[i + 1];
    const until = next ? addDays(next.effectiveFrom, -1) : null;
    const current = p.effectiveFrom <= today && (until === null || until >= today);
    return { ...p, until, current };
  });
  return out.reverse();
}

export type PatternInputProblem = "invalid_hours" | "date_taken";

/** Checks a new pattern before saving. Past-date protection is enforced by the database. */
export function checkNewPattern(
  existing: readonly WorkingPattern[],
  effectiveFrom: DateOnly,
  hours: readonly number[],
): PatternInputProblem | null {
  if (hours.length !== 7 || hours.some((h) => !Number.isFinite(h) || h < 0 || h > 24)) return "invalid_hours";
  if (existing.some((p) => p.effectiveFrom === effectiveFrom)) return "date_taken";
  return null;
}
