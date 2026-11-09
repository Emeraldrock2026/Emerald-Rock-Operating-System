import { describe, expect, it } from "vitest";
import { linkRestrictionMessage, outstandingActions, parseFolderPaths, projectModuleState, selectableProjectModules, templatePreview, upcomingDates } from "./project-setup";
import { checkDisable, PROJECT_MODULE_IDS, type ModuleId } from "./modules";

const biz = new Set<ModuleId>(["clients_projects", "photos", "rfis"]);

describe("project modules", () => {
  it("catalogue has the 15 project modules", () => expect(PROJECT_MODULE_IDS).toHaveLength(15));
  it("a module off for the business is off for every project even if the project chose it", () =>
    expect(projectModuleState("drawings", biz, new Set(["drawings"]))).toBe("off_for_business"));
  it("a business module not chosen for the project is off for the project", () =>
    expect(projectModuleState("photos", biz, new Set())).toBe("off_for_project"));
  it("active only when on for both", () => expect(projectModuleState("rfis", biz, new Set(["rfis"]))).toBe("active"));
  it("projects can only choose from business modules", () => expect(selectableProjectModules(biz)).toEqual(["photos", "rfis"]));
  it("Clients & Projects can't be switched off while a project module is on", () =>
    expect(checkDisable("clients_projects", biz)).toEqual({ ok: false, blockedBy: ["photos", "rfis"] }));
});

describe("templates", () => {
  it("skips template modules the business doesn't have", () =>
    expect(templatePreview(["photos", "drawings"], biz)).toEqual({ apply: ["photos"], skipped: ["drawings"] }));
  it("cleans and de-duplicates folder paths", () =>
    expect(parseFolderPaths(" Design / Drawings \n\ndesign/drawings\nPhotos")).toEqual({ ok: true, paths: ["Design/Drawings", "Photos"] }));
  it("rejects empty segments", () => expect(parseFolderPaths("Design//Drawings").ok).toBe(false));
  it("rejects more than 6 levels", () => expect(parseFolderPaths("a/b/c/d/e/f/g").ok).toBe(false));
});

describe("dashboard", () => {
  const recs = [
    { id: "1", reference: "ERC-0001-RFI-0002", title: "B", module_id: "rfis", is_closed: false, due_date: "2026-11-20", responsible_employee_id: null },
    { id: "2", reference: "ERC-0001-RFI-0001", title: "A", module_id: "rfis", is_closed: false, due_date: "2026-11-01", responsible_employee_id: null },
    { id: "3", reference: "ERC-0001-RFI-0003", title: "C", module_id: "rfis", is_closed: true, due_date: "2026-11-02", responsible_employee_id: null },
    { id: "4", reference: "ERC-0001-RFI-0004", title: "D", module_id: "rfis", is_closed: false, due_date: null, responsible_employee_id: null },
  ];
  it("lists open actions overdue first, undated last, closed excluded", () => {
    const r = outstandingActions(recs, "2026-11-09");
    expect(r.map((x) => x.id)).toEqual(["2", "1", "4"]);
    expect(r[0]!.overdue).toBe(true);
  });
  it("upcoming dates include overdue and in-window, exclude achieved and beyond window", () => {
    const keys = [
      { id: "k1", label: "Handover", due_on: "2026-11-15", achieved_on: null },
      { id: "k2", label: "Start", due_on: "2026-11-01", achieved_on: "2026-11-01" },
      { id: "k3", label: "Later", due_on: "2026-12-30", achieved_on: null },
    ];
    expect(upcomingDates(keys, recs, "2026-11-09", "2026-11-23").map((x) => x.id)).toEqual(["2", "k1", "1"]);
  });
  it("explains restricted links rather than hiding them", () =>
    expect(linkRestrictionMessage("module_off_for_business", "rfis")).toContain("RFIs is switched off"));
});
