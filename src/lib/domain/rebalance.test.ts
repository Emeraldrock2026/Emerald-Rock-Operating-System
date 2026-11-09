import { describe, expect, it } from "vitest";
import { overCapacityDays, validateProposals, type RbInput } from "./rebalance";

const std = [{ effectiveFrom: "2000-01-01", hours: [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0] as const }];
const base = (): RbInput => ({
  allocations: [
    { id: "a1", employee_id: "e1", project_id: "p1", allocation_date: "2026-11-10", hours: 6 },
    { id: "a2", employee_id: "e1", project_id: "p1", allocation_date: "2026-11-10", hours: 4 },
    { id: "a3", employee_id: "e2", project_id: "p1", allocation_date: "2026-11-10", hours: 5 },
  ],
  employees: [{ id: "e1", active: true }, { id: "e2", active: true }, { id: "e3", active: false }],
  projects: [{ id: "p1", status: "active" }],
  patterns: new Map([["e1", [...std]], ["e2", [...std]], ["e3", [...std]]]),
  days: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
  today: "2026-11-09",
});
const mv = (o: object) => ({ allocation_id: "a2", hours: 2.5, to_employee_id: "e2", to_date: "2026-11-10", reason: "r", ...o });

describe("rebalancing suggestions", () => {
  it("finds over-capacity days", () => {
    expect(overCapacityDays(base())).toEqual([{ employee_id: "e1", date: "2026-11-10", allocated: 10, capacity: 7.5, over: 2.5 }]);
  });
  it("accepts a move that fits the target's hours", () => {
    expect(validateProposals(base(), [mv({})]).accepted).toHaveLength(1);
  });
  it("rejects moves that overload the target, use inactive people, weekends with no hours or past days", () => {
    const r = validateProposals(base(), [mv({ hours: 3 }), mv({ to_employee_id: "e3" }), mv({ to_employee_id: "e1", to_date: "2026-11-14" }), mv({ to_date: "2026-11-08" })]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(4);
  });
  it("rejects a second move once the day is no longer over", () => {
    const r = validateProposals(base(), [mv({}), mv({ hours: 1, to_employee_id: "e1", to_date: "2026-11-11" })]);
    expect(r.accepted).toHaveLength(1);
  });
  it("rejects moves for projects that can't take work", () => {
    const b = base(); b.projects = [{ id: "p1", status: "completed" }];
    expect(validateProposals(b, [mv({})]).accepted).toHaveLength(0);
  });
});
