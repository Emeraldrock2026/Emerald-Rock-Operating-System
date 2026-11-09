import { describe, expect, it } from "vitest";
import { addDays, formatDateGB, isDateOnly, startOfWeek, todayIn, weekDates } from "./dates";
import {
  DEFAULT_WEEKLY_HOURS,
  capacityOn,
  dayFigures,
  needsOverAllocationConfirmation,
  plannedAllocationPercent,
  sumDays,
} from "./capacity";
import { checkDisable, checkEnable } from "./modules";
import { can, type MembershipContext } from "./permissions";
import {
  allocationPolicyForStatus,
  formatProjectReference,
  isOutsidePlannedDates,
} from "./projects";

describe("dates", () => {
  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // Sunday -> Monday
    expect(weekDates("2026-11-11")).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
  });
  it("date-only arithmetic is unaffected by the clocks changing", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
  it("displays dates as DD/MM/YYYY", () => {
    expect(formatDateGB("2026-03-07")).toBe("07/03/2026");
  });
  it("rejects impossible dates", () => {
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-02-28")).toBe(true);
  });
  it("today is taken in the business timezone", () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST)
    expect(todayIn("Europe/London", new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

describe("capacity", () => {
  it("defaults to 7.5 hours Monday to Friday and none at weekends", () => {
    expect(DEFAULT_WEEKLY_HOURS).toEqual([7.5, 7.5, 7.5, 7.5, 7.5, 0, 0]);
  });
  it("a new working pattern does not rewrite earlier dates", () => {
    const patterns = [
      { effectiveFrom: "2026-01-01", hours: DEFAULT_WEEKLY_HOURS },
      { effectiveFrom: "2026-11-16", hours: [7.5, 7.5, 7.5, 0, 0, 0, 0] as const },
    ];
    expect(capacityOn(patterns, "2026-11-12")).toBe(7.5); // Thursday before change
    expect(capacityOn(patterns, "2026-11-19")).toBe(0); // Thursday after change
  });
  it("no pattern yet means zero capacity", () => {
    expect(capacityOn([{ effectiveFrom: "2027-01-01", hours: DEFAULT_WEEKLY_HOURS }], "2026-12-31")).toBe(0);
  });
  it("daily figures: allocated, remaining and over-allocation", () => {
    expect(dayFigures([4, 4.5], 7.5)).toEqual({ allocated: 8.5, capacity: 7.5, remaining: -1, overAllocation: 1 });
    expect(dayFigures([0.1, 0.2], 7.5)).toEqual({ allocated: 0.3, capacity: 7.5, remaining: 7.2, overAllocation: 0 });
  });
  it("weekly totals equal the sum of the days", () => {
    const week = sumDays([dayFigures([8.5], 7.5), dayFigures([3], 7.5), dayFigures([], 0)]);
    expect(week).toEqual({ allocated: 11.5, capacity: 15, remaining: 3.5, overAllocation: 1 });
  });
  it("planned allocation % handles zero capacity", () => {
    expect(plannedAllocationPercent(30, 37.5)).toBe(80);
    expect(plannedAllocationPercent(5, 0)).toBeNull();
  });
  it("confirmation is required when a save causes or increases over-allocation", () => {
    expect(needsOverAllocationConfirmation([6], 7.5, 1.5)).toBe(false); // exactly full
    expect(needsOverAllocationConfirmation([6], 7.5, 2)).toBe(true); // causes
    expect(needsOverAllocationConfirmation([6], 7.5, 3, 2)).toBe(true); // increases
    expect(needsOverAllocationConfirmation([6], 7.5, 2, 3)).toBe(false); // reduces
  });
});

describe("modules", () => {
  it("cannot enable Resource Planning or Commercial without Clients & Projects", () => {
    expect(checkEnable("resource_planning", new Set())).toEqual({ ok: false, missingDependencies: ["clients_projects"] });
    expect(checkEnable("commercial", new Set(["clients_projects"]))).toEqual({ ok: true });
  });
  it("cannot disable Clients & Projects while dependants are enabled", () => {
    expect(checkDisable("clients_projects", new Set(["clients_projects", "resource_planning", "commercial"]))).toEqual({
      ok: false,
      blockedBy: ["resource_planning", "commercial"],
    });
    expect(checkDisable("clients_projects", new Set(["clients_projects"]))).toEqual({ ok: true });
  });
});

describe("permissions", () => {
  const all = new Set(["clients_projects", "resource_planning", "commercial"] as const);
  const ctx = (o: Partial<MembershipContext>): MembershipContext => ({
    role: "employee", status: "active", commercialAccess: false, tenantActive: true, enabledModules: all, ...o,
  });
  it("employees cannot see budgets or manage anything", () => {
    expect(can(ctx({}), "commercial.view")).toBe(false);
    expect(can(ctx({}), "allocations.manage")).toBe(false);
    expect(can(ctx({}), "allocations.view_own")).toBe(true);
  });
  it("resource managers get commercial access only when granted", () => {
    expect(can(ctx({ role: "resource_manager" }), "commercial.view")).toBe(false);
    expect(can(ctx({ role: "resource_manager", commercialAccess: true }), "commercial.edit")).toBe(true);
    expect(can(ctx({ role: "resource_manager" }), "tenant.users.manage")).toBe(false);
  });
  it("suspended memberships and tenants lose all access", () => {
    expect(can(ctx({ role: "owner_admin", status: "suspended" }), "projects.view_all")).toBe(false);
    expect(can(ctx({ role: "owner_admin", tenantActive: false }), "tenant.settings.manage")).toBe(false);
  });
  it("a disabled module removes its permissions", () => {
    const cpOnly = new Set(["clients_projects"] as const);
    expect(can(ctx({ role: "owner_admin", enabledModules: cpOnly }), "commercial.view")).toBe(false);
    expect(can(ctx({ role: "owner_admin", enabledModules: cpOnly }), "allocations.view_all")).toBe(false);
    expect(can(ctx({ role: "owner_admin", enabledModules: cpOnly }), "projects.manage")).toBe(true);
  });
});

describe("projects", () => {
  it("references use the tenant prefix and a four-digit sequence", () => {
    expect(formatProjectReference("ERC", 1)).toBe("ERC-0001");
    expect(formatProjectReference("ERC", 12345)).toBe("ERC-12345");
    expect(() => formatProjectReference("erc", 1)).toThrow();
  });
  it("only Active projects take allocations freely; On Hold needs confirmation", () => {
    expect(allocationPolicyForStatus("active")).toBe("allowed");
    expect(allocationPolicyForStatus("on_hold")).toBe("confirm");
    expect(allocationPolicyForStatus("draft")).toBe("blocked");
    expect(allocationPolicyForStatus("completed")).toBe("blocked");
    expect(allocationPolicyForStatus("archived")).toBe("blocked");
  });
  it("warns when an allocation falls outside planned dates", () => {
    expect(isOutsidePlannedDates("2026-11-09", "2026-11-10", "2026-12-31")).toBe(true);
    expect(isOutsidePlannedDates("2026-11-10", "2026-11-10", "2026-12-31")).toBe(false);
    expect(isOutsidePlannedDates("2027-01-01", "2026-11-10", "2026-12-31")).toBe(true);
  });
});
