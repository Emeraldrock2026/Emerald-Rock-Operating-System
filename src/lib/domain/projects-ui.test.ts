import { describe, expect, it } from "vitest";
import { allowedStatusTransitions, filterProjects, selectableClients, validateProjectDates } from "./projects";

const ps = [
  { reference: "ERC-0001", name: "Harbour Bridge", status: "active" as const, client_id: "c1" },
  { reference: "ERC-0002", name: "Depot", status: "completed" as const, client_id: "c2" },
  { reference: "ERC-0003", name: "School", status: "draft" as const, client_id: null },
];

describe("project screens", () => {
  it("offers sensible status changes", () => {
    expect(allowedStatusTransitions("active")).toEqual(["on_hold", "completed"]);
    expect(allowedStatusTransitions("archived")).toEqual(["draft"]);
  });
  it("finish date cannot be before start date", () => {
    expect(validateProjectDates("2026-12-01", "2026-11-30")).toBe("finish_before_start");
    expect(validateProjectDates("2026-12-01", "2026-12-01")).toBeNull();
  });
  it("inactive clients are excluded unless already chosen", () => {
    const cs = [{ id: "a", active: true }, { id: "b", active: false }];
    expect(selectableClients(cs).map((c) => c.id)).toEqual(["a"]);
    expect(selectableClients(cs, "b").map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("filters: open by default, search by reference or name, by client", () => {
    expect(filterProjects(ps, {}).map((p) => p.reference)).toEqual(["ERC-0001", "ERC-0003"]);
    expect(filterProjects(ps, { status: "all", search: "erc-0002" })).toHaveLength(1);
    expect(filterProjects(ps, { status: "all", search: "depot" })[0]!.reference).toBe("ERC-0002");
    expect(filterProjects(ps, { status: "all", clientId: "c1" })).toHaveLength(1);
    expect(filterProjects(ps, { status: "completed" })).toHaveLength(1);
  });
});
