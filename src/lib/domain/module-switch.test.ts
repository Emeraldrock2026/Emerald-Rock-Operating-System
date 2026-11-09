import { describe, expect, it } from "vitest";
import { switchBlockedReason, type ModuleId } from "./modules";

const set = (...ids: ModuleId[]) => new Set<ModuleId>(ids);

describe("module switches", () => {
  it("blocks Resource Planning while Clients & Projects is off", () => {
    expect(switchBlockedReason("resource_planning", set())).toBe("Needs Clients & Projects switched on first.");
  });
  it("blocks Commercial while Clients & Projects is off", () => {
    expect(switchBlockedReason("commercial", set())).not.toBeNull();
  });
  it("blocks switching off Clients & Projects while dependants are on", () => {
    expect(switchBlockedReason("clients_projects", set("clients_projects", "resource_planning", "commercial"))).toBe(
      "Switch off Resource Planning and Commercial first.",
    );
  });
  it("allows switching on a module whose dependency is on", () => {
    expect(switchBlockedReason("commercial", set("clients_projects"))).toBeNull();
  });
});
