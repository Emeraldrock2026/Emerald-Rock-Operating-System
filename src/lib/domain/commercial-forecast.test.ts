import { describe, expect, it } from "vitest";
import { commercialForecast, forecastText, parseMoney } from "./commercial";
const ch = (status: string, estimate: number | null, is_closed = false) => ({ id: status + estimate, status, is_closed, estimate });
describe("commercial forecast", () => {
  it("variance is forecast minus agreed fee", () => {
    expect(commercialForecast(100000, 112500, [])).toMatchObject({ variance: 12500, variancePct: 12.5 });
    expect(commercialForecast(100000, 95000, [])).toMatchObject({ variance: -5000, variancePct: -5 });
  });
  it("missing forecast is not treated as zero", () => {
    const f = commercialForecast(100000, null, [ch("draft", 2000)]);
    expect(f).toMatchObject({ forecast: null, variance: null, forecastWithPending: null, pendingExposure: 2000 });
    expect(forecastText(null)).toBe("Forecast not entered");
    expect(forecastText(0)).toBe("£0.00");
    expect(commercialForecast(null, 5000, []).variance).toBeNull();
  });
  it("pending exposure excludes withdrawn and closed changes and counts unestimated ones", () => {
    const f = commercialForecast(100000, 110000, [ch("draft", 2500.5), ch("draft", null), ch("withdrawn", 9000), ch("instructed", 1000, true), ch("draft", -500)]);
    expect(f).toMatchObject({ pendingCount: 3, pendingExposure: 2000.5, unestimated: 1, forecastWithPending: 112000.5 });
  });
  it("money parsing", () => {
    expect(parseMoney("£12,500.50", "X")).toBe(12500.5);
    expect(parseMoney("", "X")).toBeNull();
    expect(() => parseMoney("1.234", "X")).toThrow();
  });
});
