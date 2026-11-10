import { describe, it, expect } from "vitest";
import { DEFAULT_DASHBOARD_SETTINGS as defaults, dashboardSettingsSchema, resolveHealthWeights, mappedStatusTone } from "./dashboard-settings";
import { projectHealth, DEFAULT_WEIGHTS } from "./health";
import { milestoneView } from "./milestones";
import { basisForecast } from "./commercial";

describe("business dashboard settings", () => {
  it("preserves ordered widgets and allows all to be hidden without data changes", () => {
    expect(dashboardSettingsSchema.parse({ ...defaults, widgets: ["commercial", "health"] }).widgets).toEqual(["commercial", "health"]);
    expect(dashboardSettingsSchema.parse({ ...defaults, widgets: [] }).widgets).toEqual([]);
    expect(dashboardSettingsSchema.safeParse({ ...defaults, widgets: ["health", "health"] }).success).toBe(false);
  });
  it("business weights inherit while explicit project overrides remain unchanged", () => {
    const config = { ...defaults, weights: { actions: 60, milestones: 20, qa: 10, commercial: 10 } };
    expect(resolveHealthWeights(config, null)).toEqual(config.weights);
    expect(resolveHealthWeights(config, DEFAULT_WEIGHTS)).toEqual(DEFAULT_WEIGHTS);
    expect(resolveHealthWeights(config, DEFAULT_WEIGHTS, true)).toEqual(config.weights);
  });
  it("rejects zero or out-of-range weights and freshness outside 1–365", () => {
    expect(dashboardSettingsSchema.safeParse({ ...defaults, weights: { actions: 0, milestones: 0, qa: 0, commercial: 0 } }).success).toBe(false);
    expect(dashboardSettingsSchema.safeParse({ ...defaults, weights: { ...DEFAULT_WEIGHTS, actions: 101 } }).success).toBe(false);
    for (const days of [0, 366, 1.5]) expect(dashboardSettingsSchema.safeParse({ ...defaults, freshness: { milestones: days, commercial: 28 } }).success).toBe(false);
  });
  it("flags milestone freshness strictly after configured calendar-day threshold", () => {
    const m = { id: "m", name: "M", baseline_date: "2026-12-01", forecast_date: "2026-12-01", actual_date: null, forecast_updated_on: "2026-11-01" };
    expect(milestoneView(m, "2026-11-10", 9).flags).toEqual([]);
    expect(milestoneView(m, "2026-11-10", 8).flags).toContain("stale_forecast");
    expect(milestoneView({ ...m, forecast_updated_on: null }, "2026-11-10", 365).flags).toContain("stale_forecast");
  });
  it("uses business commercial freshness in the deterministic health deduction", () => {
    const input = { today: "2026-11-10", modules: [], records: [], milestones: null, commercial: { ...basisForecast("cost", 100, [], 100, []), updatedOn: "2026-11-01" }, weights: { actions: 0, milestones: 0, qa: 0, commercial: 100 }, projectId: "p", projectReference: "P" };
    expect(projectHealth({ ...input, freshness: { milestones: 28, commercial: 9 } }).score).toBe(100);
    expect(projectHealth({ ...input, freshness: { milestones: 28, commercial: 8 } }).score).toBe(75);
  });
  it("display mappings never change failed QA or its critical override", () => {
    const config = { ...defaults, statusMappings: { qa: { failed: "green" as const } } };
    expect(mappedStatusTone("qa", "failed", config)).toBe("green");
    const r = { id: "qa", reference: "QA-1", title: "Failed", module_id: "qa", status: "failed", is_closed: false, due_date: null, created_on: "2026-11-01", closed_on: null };
    const h = projectHealth({ today: "2026-11-10", modules: ["qa"], records: [r], milestones: null, commercial: null, weights: DEFAULT_WEIGHTS, projectId: "p", projectReference: "P" });
    expect(h.critical).toBe(true); expect(h.score).toBe(0); expect(r.is_closed).toBe(false);
  });
});