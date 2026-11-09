import { describe, expect, it } from "vitest";
import { allocationWarnings, canReceiveAllocations, parseAllocationHours } from "./planner";

describe("planner rules", () => {
  it("accepts quarter hours up to 24", () => {
    expect(parseAllocationHours("3.75")).toBe(3.75);
    expect(() => parseAllocationHours("0")).toThrow();
    expect(() => parseAllocationHours("24.25")).toThrow();
    expect(() => parseAllocationHours("1.1")).toThrow();
  });
  it("warns outside planned dates and when on hold", () => {
    const p = { status: "active" as const, start_date: "2026-11-02", planned_finish_date: "2026-11-30" };
    expect(allocationWarnings(p, "2026-11-10")).toEqual([]);
    expect(allocationWarnings(p, "2026-12-01")).toHaveLength(1);
    expect(allocationWarnings({ ...p, status: "on_hold" }, "2026-11-01")).toHaveLength(2);
  });
  it("only active and on hold projects take work", () => {
    expect(canReceiveAllocations("active")).toBe(true);
    expect(canReceiveAllocations("on_hold")).toBe(true);
    expect(canReceiveAllocations("draft")).toBe(false);
    expect(canReceiveAllocations("completed")).toBe(false);
  });
});
