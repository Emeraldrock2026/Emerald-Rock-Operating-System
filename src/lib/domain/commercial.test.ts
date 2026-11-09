import { describe, expect, it } from "vitest";
import { formatGBP, impliedRate, parseCommercialInput } from "./commercial";

describe("commercial values", () => {
  it("parses pounds with symbol and commas", () => {
    expect(parseCommercialInput("£12,500.50", "100")).toEqual({ agreed_fee: 12500.5, budget_hours: 100 });
  });
  it("treats blanks as not set", () => {
    expect(parseCommercialInput("", " ")).toEqual({ agreed_fee: null, budget_hours: null });
  });
  it("rejects negatives and 3 decimal places", () => {
    expect(() => parseCommercialInput("-1", "")).toThrow();
    expect(() => parseCommercialInput("", "1.234")).toThrow();
  });
  it("works out implied rate only with both values", () => {
    expect(impliedRate({ agreed_fee: 10000, budget_hours: 80 })).toBe(125);
    expect(impliedRate({ agreed_fee: 10000, budget_hours: 0 })).toBeNull();
    expect(impliedRate({ agreed_fee: null, budget_hours: 80 })).toBeNull();
  });
  it("formats GBP", () => {
    expect(formatGBP(1234.5)).toBe("£1,234.50");
  });
});
