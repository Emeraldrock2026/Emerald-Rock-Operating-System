import { describe, expect, it } from "vitest";
import { fileReplaceable, isLateForecast, isOverdue, nextStatuses, REGISTERS, statusProblem } from "./registers";

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

  it("never lets uploading approve RAMS; only project admins approve, and a document is needed first", () => {
    expect(nextStatuses("rams", "submitted", false)).toEqual(["draft"]);
    expect(nextStatuses("rams", "submitted", true)).toContain("approved");
    expect(statusProblem("rams", "approved", {})).toBe("Upload the document first.");
    expect(statusProblem("rams", "approved", { file_id: "f" })).toBeNull();
    expect(REGISTERS.rams.notice).toMatch(/Uploading RAMS does not approve them/);
  });
  it("lock the file once RAMS are approved or a handover item accepted", () => {
    expect(fileReplaceable("rams", "submitted")).toBe(true);
    expect(fileReplaceable("rams", "approved")).toBe(false);
    expect(fileReplaceable("handover", "accepted")).toBe(false);
    expect(fileReplaceable("qa", "open")).toBe(false);
  });
  it("need a QA result before pass or fail, and a supplier before awarding", () => {
    expect(statusProblem("qa", "passed", {})).toBe("Record the inspection result first.");
    expect(statusProblem("procurement", "awarded", { supplier: " " })).toBe("Record the selected supplier first.");
    expect(nextStatuses("procurement", "tendering", false)).toEqual(["planning"]);
    expect(nextStatuses("procurement", "tendering", true)).not.toContain("ordered");
    expect(nextStatuses("procurement", "awarded", true)).toContain("ordered");
  });
  it("highlight a delivery forecast later than the required date while still expected", () => {
    expect(isLateForecast("2026-11-10", "2026-11-12", false)).toBe(true);
    expect(isLateForecast("2026-11-10", "2026-11-10", false)).toBe(false);
    expect(isLateForecast("2026-11-10", "2026-11-12", true)).toBe(false);
    expect(isLateForecast(null, "2026-11-12", false)).toBe(false);
  });
});
