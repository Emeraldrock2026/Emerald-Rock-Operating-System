import { describe, expect, it } from "vitest";
import { isOverdue, nextStatuses, REGISTERS, statusProblem } from "./registers";

describe("register status rules", () => {
  it("only project admins close or reopen RFIs", () => {
    expect(nextStatuses("rfis", "responded", false)).toEqual(["draft", "open"]);
    expect(nextStatuses("rfis", "responded", true)).toContain("closed");
    expect(nextStatuses("rfis", "closed", false)).toEqual([]);
  });
  it("only project admins make a programme current", () => {
    expect(nextStatuses("programmes", "submitted", false)).toEqual(["draft"]);
    expect(nextStatuses("programmes", "submitted", true)).toEqual(["draft", "current", "superseded"]);
  });
  it("need a response before an RFI is responded or closed", () => {
    expect(statusProblem("rfis", "responded", {})).toBe("Record the response first.");
    expect(statusProblem("rfis", "responded", { response: "Use detail 4" })).toBeNull();
  });
  it("need a file before a programme is current", () => {
    expect(statusProblem("programmes", "current", {})).toBe("Upload the programme file first.");
  });
  it("say early warnings aren't contractual notices and programmes have no critical path analysis", () => {
    expect(REGISTERS.early_warnings.notice).toMatch(/not a contractual notice/);
    expect(REGISTERS.programmes.notice).toMatch(/does not analyse .*critical path/);
  });
  it("flag overdue open items only", () => {
    expect(isOverdue("2026-11-01", "2026-11-09", false)).toBe(true);
    expect(isOverdue("2026-11-01", "2026-11-09", true)).toBe(false);
    expect(isOverdue(null, "2026-11-09", false)).toBe(false);
  });
});
