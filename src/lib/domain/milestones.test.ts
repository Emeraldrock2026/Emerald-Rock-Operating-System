import { describe, expect, it } from "vitest";
import { milestoneSummary, milestoneView, varianceLabel, type Milestone } from "./milestones";
const m = (o: Partial<Milestone>): Milestone => ({ id: "1", name: "M", baseline_date: "2026-12-01", forecast_date: null, actual_date: null, forecast_updated_on: "2026-11-09", ...o });
const today = "2026-11-09";
describe("milestones", () => {
  it("variance is forecast minus baseline in days", () => {
    expect(milestoneView(m({ forecast_date: "2026-12-11" }), today)).toMatchObject({ state: "forecast_late", variance: 10, rag: "amber" });
    expect(milestoneView(m({ forecast_date: "2026-12-16" }), today)).toMatchObject({ variance: 15, rag: "red" });
    expect(milestoneView(m({ forecast_date: "2026-11-28" }), today)).toMatchObject({ state: "on_track", variance: -3, rag: "green" });
  });
  it("actual date overrides forecast", () => {
    expect(milestoneView(m({ forecast_date: "2026-12-30", actual_date: "2026-11-05" }), today)).toMatchObject({ state: "achieved", variance: -26 });
  });
  it("missing values are not invented", () => {
    expect(milestoneView(m({}), today)).toMatchObject({ state: "no_forecast", variance: null, rag: "none" });
    expect(milestoneView(m({ baseline_date: null, forecast_date: "2026-12-01" }), today)).toMatchObject({ state: "no_baseline", variance: null });
    expect(varianceLabel(null)).toBe("Not available");
  });
  it("forecast is stale after 28 days without update", () => {
    expect(milestoneView(m({ forecast_date: "2026-12-01", forecast_updated_on: "2026-10-12" }), today).flags).toEqual([]);
    expect(milestoneView(m({ forecast_date: "2026-12-01", forecast_updated_on: "2026-10-11" }), today).flags).toEqual(["stale_forecast"]);
    expect(milestoneView(m({ forecast_date: "2026-11-01" }), today).flags).toEqual(["forecast_passed"]);
    expect(milestoneView(m({ forecast_date: "2026-11-01", actual_date: "2026-11-01", forecast_updated_on: "2026-01-01" }), today).flags).toEqual([]);
  });
  it("summary counts", () => {
    expect(milestoneSummary([m({ forecast_date: "2026-12-05" }), m({ actual_date: "2026-11-01" }), m({ baseline_date: null })], today))
      .toEqual({ total: 3, achieved: 1, late: 1, stale: 0, noBaseline: 1 });
  });
});
