import { weekdayIndex, type DateOnly } from "./dates";

/** Hours per weekday, Monday first. */
export type WeeklyHours = readonly [number, number, number, number, number, number, number];

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0];

/** An effective-dated working pattern. Applies from `effectiveFrom` until superseded. */
export interface WorkingPattern {
  effectiveFrom: DateOnly;
  hours: WeeklyHours;
}

/** Round to 2 dp so decimal hours (e.g. 0.1 + 0.2) reconcile exactly. */
export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Configured working capacity for one date: the pattern with the latest
 * effectiveFrom on or before that date. No applicable pattern = 0 hours.
 * Excludes leave and public holidays in this release.
 */
export function capacityOn(patterns: readonly WorkingPattern[], date: DateOnly): number {
  let current: WorkingPattern | undefined;
  for (const p of patterns) {
    if (p.effectiveFrom <= date && (!current || p.effectiveFrom > current.effectiveFrom)) {
      current = p;
    }
  }
  return current?.hours[weekdayIndex(date)] ?? 0;
}

export interface DayFigures {
  allocated: number;
  capacity: number;
  remaining: number;
  overAllocation: number;
}

export function dayFigures(allocationHours: readonly number[], capacity: number): DayFigures {
  const allocated = roundHours(allocationHours.reduce((s, h) => s + h, 0));
  const remaining = roundHours(capacity - allocated);
  return {
    allocated,
    capacity,
    remaining,
    overAllocation: remaining < 0 ? roundHours(-remaining) : 0,
  };
}

export function sumDays(days: readonly DayFigures[]): DayFigures {
  const allocated = roundHours(days.reduce((s, d) => s + d.allocated, 0));
  const capacity = roundHours(days.reduce((s, d) => s + d.capacity, 0));
  return {
    allocated,
    capacity,
    remaining: roundHours(capacity - allocated),
    overAllocation: roundHours(days.reduce((s, d) => s + d.overAllocation, 0)),
  };
}

/**
 * Planned allocation % = planned allocated hours / configured capacity.
 * Returns null when capacity is zero (shown as "No capacity configured").
 * This is not billable utilisation.
 */
export function plannedAllocationPercent(allocated: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((allocated / capacity) * 1000) / 10;
}

/**
 * True when saving `newHours` (optionally replacing an existing allocation of
 * `replacingHours` on the same day) causes or increases over-allocation.
 * Such saves need explicit confirmation.
 */
export function needsOverAllocationConfirmation(
  otherAllocationsThatDay: readonly number[],
  capacity: number,
  newHours: number,
  replacingHours = 0,
): boolean {
  const before = dayFigures([...otherAllocationsThatDay, replacingHours], capacity).overAllocation;
  const after = dayFigures([...otherAllocationsThatDay, newHours], capacity).overAllocation;
  return after > 0 && after > before;
}
