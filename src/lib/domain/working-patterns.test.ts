import { describe, expect, it } from "vitest";
import { capacityOn, DEFAULT_WEEKLY_HOURS, type WorkingPattern } from "./capacity";
import { checkNewPattern, FROM_START, patternPeriods, weeklyTotal } from "./working-patterns";

const base: WorkingPattern = { effectiveFrom: FROM_START, hours: DEFAULT_WEEKLY_HOURS };
const fourDay: WorkingPattern = { effectiveFrom: "2026-12-01", hours: [8, 8, 8, 8, 0, 0, 0] };

describe("working patterns", () => {
  it("default week totals 37.5 hours", () => {
    expect(weeklyTotal(DEFAULT_WEEKLY_HOURS)).toBe(37.5);
  });
  it("a pattern from a chosen date leaves earlier dates unchanged", () => {
    // 2026-11-27 is a Friday before the change; 2026-12-04 is a Friday after it.
    expect(capacityOn([base, fourDay], "2026-11-27")).toBe(7.5);
    expect(capacityOn([base, fourDay], "2026-12-04")).toBe(0);
  });
  it("periods end the day before the next pattern starts", () => {
    const periods = patternPeriods([base, fourDay], "2026-11-09");
    expect(periods[0]).toMatchObject({ effectiveFrom: "2026-12-01", until: null, current: false });
    expect(periods[1]).toMatchObject({ effectiveFrom: FROM_START, until: "2026-11-30", current: true });
  });
  it("rejects hours above 24 or below 0, and a second pattern on the same date", () => {
    expect(checkNewPattern([base], "2026-12-01", [25, 0, 0, 0, 0, 0, 0])).toBe("invalid_hours");
    expect(checkNewPattern([base], "2026-12-01", [-1, 0, 0, 0, 0, 0, 0])).toBe("invalid_hours");
    expect(checkNewPattern([base, fourDay], "2026-12-01", [7, 7, 7, 7, 7, 0, 0])).toBe("date_taken");
    expect(checkNewPattern([base], "2026-12-01", [7, 7, 7, 7, 7, 0, 0])).toBeNull();
  });
});
