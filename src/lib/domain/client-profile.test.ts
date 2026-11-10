import { describe, expect, it } from "vitest";
import { duplicateContactIds, identityGaps, informationComplete, validCompanyNumber, liveProjectCount } from "./client-profile";
describe("client profile rules", () => {
  it("keeps TBA and unknown visibly incomplete", () => { expect(informationComplete("TBA")).toBe(false); expect(informationComplete("unknown")).toBe(false); expect(identityGaps({ legal_name: "Unknown" })).toHaveLength(4); });
  it("preserves leading-zero UK company numbers as text", () => { expect(validCompanyNumber("00123456", "UK")).toBe(true); expect(validCompanyNumber("123456", "UK")).toBe(false); });
  it("accepts a minimal prospect without a registration number", () => { expect(validCompanyNumber("", "UK")).toBe(true); });
  it("does not apply UK rules to another jurisdiction", () => { expect(validCompanyNumber("HRB 1234", "Germany")).toBe(true); });
  it("counts active and on-hold projects but not drafts or closed work", () => { expect(liveProjectCount([{status:"active"},{status:"on_hold"},{status:"draft"},{status:"completed"},{status:"archived"}])).toBe(2); });
});
describe("duplicateContactIds", () => {
  it("flags contacts sharing an email, case-insensitively", () => {
    const flagged = duplicateContactIds([
      { id: "a", name: "Steve Hampshire", email: "Steve@Example.com" },
      { id: "b", name: "S Hampshire", email: "steve@example.com" },
      { id: "c", name: "Other Person", email: null },
    ]);
    expect([...flagged].sort()).toEqual(["a", "b"]);
  });
  it("flags identical names but never merges silently", () => {
    const flagged = duplicateContactIds([
      { id: "a", name: "Alex Smith", email: null },
      { id: "b", name: "alex smith", email: "different@example.com" },
    ]);
    expect(flagged.has("a")).toBe(true);
    expect(flagged.has("b")).toBe(true);
  });
  it("leaves distinct contacts alone", () => {
    expect(duplicateContactIds([
      { id: "a", name: "Alex Smith", email: "a@example.com" },
      { id: "b", name: "Sam Jones", email: "b@example.com" },
    ]).size).toBe(0);
  });
});
