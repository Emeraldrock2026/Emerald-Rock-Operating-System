import { describe, expect, it } from "vitest";
import { availableExports, csvCell, exportFileName, overviewCards, toCsv } from "./exports";
import type { MembershipContext } from "./permissions";
import type { ModuleId } from "./modules";

const all: ModuleId[] = ["core", "clients_projects", "resource_planning", "commercial"] as ModuleId[];
const ctx = (o: Partial<MembershipContext> = {}): MembershipContext => ({
  role: "owner_admin", status: "active", commercialAccess: false, tenantActive: true, enabledModules: new Set(all), ...o,
});
const kinds = (c: MembershipContext) => availableExports(c).map((d) => d.kind);

describe("exports access", () => {
  it("Owner/Admin gets every export when all modules are on", () => {
    expect(kinds(ctx())).toEqual(["clients", "projects", "employees", "allocations", "commercial"]);
  });
  it("Resource Manager without the grant gets no fees export", () => {
    expect(kinds(ctx({ role: "resource_manager" }))).not.toContain("commercial");
  });
  it("Resource Manager with the grant gets the fees export", () => {
    expect(kinds(ctx({ role: "resource_manager", commercialAccess: true }))).toContain("commercial");
  });
  it("Employee only gets projects and own allocations", () => {
    expect(kinds(ctx({ role: "employee" }))).toEqual(["projects", "allocations"]);
  });
  it("Commercial switched off removes the fees export even for Owner/Admin", () => {
    expect(kinds(ctx({ enabledModules: new Set(["core", "clients_projects", "resource_planning"] as ModuleId[]) }))).not.toContain("commercial");
  });
  it("Clients & Projects only business has no allocations export", () => {
    expect(kinds(ctx({ enabledModules: new Set(["core", "clients_projects"] as ModuleId[]) }))).toEqual(["clients", "projects", "employees"]);
  });
  it("suspended membership gets nothing", () => {
    expect(kinds(ctx({ status: "suspended" }))).toEqual([]);
  });
});

describe("overview cards", () => {
  it("Employee sees own week, not team week or fees", () => {
    expect(overviewCards(ctx({ role: "employee" }))).toEqual(["clients_projects", "my_week", "exports"]);
  });
  it("Owner/Admin sees team week and fees", () => {
    expect(overviewCards(ctx())).toEqual(["clients_projects", "team_week", "commercial", "exports"]);
  });
  it("Resource Manager without grant sees no fees card", () => {
    expect(overviewCards(ctx({ role: "resource_manager" }))).not.toContain("commercial");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Smith, "Jo"\nLtd')).toBe('"Smith, ""Jo""\nLtd"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM")).toBe("'@SUM");
  });
  it("keeps numbers and blanks", () => {
    expect(toCsv(["a", "b"], [[-7.5, null]])).toBe("a,b\r\n-7.5,\r\n");
  });
  it("names files by business, kind and date", () => {
    expect(exportFileName("Emerald Rock", "projects", "2026-11-09")).toBe("emerald-rock-projects-2026-11-09.csv");
  });
});
