import { describe, expect, it } from "vitest";
import { basisForecast, currentBudget, varianceDirection } from "./commercial";

describe("budget basis", () => {
  it("current budget adds adjustments to the original budget", () => {
    expect(currentBudget(100000, [{ amount: 5000 }, { amount: -1500.5 }])).toBe(103499.5);
  });
  it("no original budget means no current budget, even with adjustments", () => {
    expect(currentBudget(null, [{ amount: 5000 }])).toBeNull();
  });
  it("forecast above budget is favourable on revenue and adverse on cost or expenditure", () => {
    expect(varianceDirection("revenue", 100)).toBe("favourable");
    expect(varianceDirection("cost", 100)).toBe("adverse");
    expect(varianceDirection("expenditure", 100)).toBe("adverse");
    expect(varianceDirection("cost", -100)).toBe("favourable");
  });
  it("variance compares against the adjusted budget, not the original", () => {
    const f = basisForecast("cost", 100000, [{ amount: 10000 }], 112500, []);
    expect(f.budget).toBe(110000);
    expect(f.variance).toBe(2500);
    expect(f.direction).toBe("adverse");
  });
  it("missing forecast gives no variance or direction", () => {
    const f = basisForecast("revenue", 100000, [], null, []);
    expect(f.variance).toBeNull();
    expect(f.direction).toBeNull();
  });
});
