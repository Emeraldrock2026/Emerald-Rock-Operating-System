import { describe, expect, it } from "vitest";
import { identityGaps, informationComplete, validCompanyNumber, liveProjectCount } from "./client-profile";
describe("client profile rules", () => {
  it("keeps TBA and unknown visibly incomplete", () => { expect(informationComplete("TBA")).toBe(false); expect(informationComplete("unknown")).toBe(false); expect(identityGaps({ legal_name: "Unknown" })).toHaveLength(4); });
  it("preserves leading-zero UK company numbers as text", () => { expect(validCompanyNumber("00123456", "UK")).toBe(true); expect(validCompanyNumber("123456", "UK")).toBe(false); });
  it("accepts a minimal prospect without a registration number", () => { expect(validCompanyNumber("", "UK")).toBe(true); });
  it("does not apply UK rules to another jurisdiction", () => { expect(validCompanyNumber("HRB 1234", "Germany")).toBe(true); });
  it("counts active and on-hold projects but not drafts or closed work", () => { expect(liveProjectCount([{status:"active"},{status:"on_hold"},{status:"draft"},{status:"completed"},{status:"archived"}])).toBe(2); });
});