import { describe, expect, it } from "vitest";
import { normaliseProjectPrefix, setupStage, setupSteps } from "./tenant-setup";

const base = { status: "active" as const, ownersActive: 0, ownersInvited: 0, modulesEnabled: [] as string[] };

describe("setupStage", () => {
  it("suspended wins over everything", () => {
    expect(setupStage({ ...base, status: "suspended", ownersActive: 1, modulesEnabled: ["core"] })).toBe("suspended");
  });
  it("no owner at all needs an owner", () => expect(setupStage(base)).toBe("needs_owner"));
  it("only an invited owner is waiting", () => expect(setupStage({ ...base, ownersInvited: 1 })).toBe("owner_invited"));
  it("active owner but no modules", () => expect(setupStage({ ...base, ownersActive: 1 })).toBe("needs_modules"));
  it("active owner and a module is ready", () =>
    expect(setupStage({ ...base, ownersActive: 1, modulesEnabled: ["clients_projects"] })).toBe("ready"));
});

describe("setupSteps", () => {
  it("invited owner counts as invited but not signed in", () => {
    const s = setupSteps({ ...base, ownersInvited: 1 });
    expect(s.map((x) => x.done)).toEqual([true, true, false, false]);
  });
});

describe("normaliseProjectPrefix", () => {
  it("uppercases valid prefixes", () => expect(normaliseProjectPrefix(" hpd ")).toBe("HPD"));
  it("rejects a leading digit", () => expect(normaliseProjectPrefix("1AB")).toBeNull());
  it("rejects one character", () => expect(normaliseProjectPrefix("A")).toBeNull());
  it("rejects more than six", () => expect(normaliseProjectPrefix("ABCDEFG")).toBeNull());
});
