import { describe, expect, it } from "vitest";
import { canonicalSnapshot, DELAY_DISCLAIMER, pdfSafe, reportFileName, reportProblems, wrapText, type ReportSnapshot } from "./reports";

const base: ReportSnapshot = { module: "progress_reports", reference: "ERC-0001-PRO-0001", title: "Week 45", project: { reference: "ERC-0001", name: "P" },
  fields: { period_start: "2026-11-02", period_end: "2026-11-08", summary: "Good week" }, photos: [] };

describe("report rules", () => {
  it("need a valid period and summary for progress reports", () => {
    expect(reportProblems(base)).toEqual([]);
    expect(reportProblems({ ...base, fields: { ...base.fields, period_end: "2026-11-01" } })).toContain("The period must end on or after its start.");
    expect(reportProblems({ ...base, fields: { period_start: "2026-11-02", period_end: "2026-11-08" } })).toContain("Write a summary.");
  });
  it("need a date and description for delay reports and a numeric estimate", () => {
    const d = { module: "delay_reports" as const, photos: [], fields: { event_date: "2026-11-03", description: "Late steel", estimated_days: "abc" } };
    expect(reportProblems(d)).toEqual(["Estimated delay must be a number of working days."]);
    expect(reportProblems({ ...d, fields: { ...d.fields, estimated_days: "5" } })).toEqual([]);
  });
  it("say a delay report is not an extension of time", () => {
    expect(DELAY_DISCLAIMER).toMatch(/not a notice, claim or award of an extension of time/);
  });
  it("hash the same content identically whatever the key order", () => {
    const a = canonicalSnapshot(base);
    const b = canonicalSnapshot({ ...base, fields: { summary: "Good week", period_end: "2026-11-08", period_start: "2026-11-02" } });
    expect(a).toBe(b);
    expect(canonicalSnapshot({ ...base, title: "Week 46" })).not.toBe(a);
  });
  it("number issue files", () => { expect(reportFileName("ERC-0001-PRO-0001", 3)).toBe("ERC-0001-PRO-0001-issue-03.pdf"); });
});

describe("PDF text", () => {
  it("replace characters the PDF font can't show but keep £", () => {
    expect(pdfSafe("“Fee” £5 – ok 😀")).toBe('"Fee" £5 - ok ??');
  });
  it("wrap by width and keep blank lines", () => {
    expect(wrapText("aa bb cc\n\ndd", 5, (s) => s.length)).toEqual(["aa bb", "cc", "", "dd"]);
    expect(wrapText("abcdefgh", 3, (s) => s.length)).toEqual(["abc", "def", "gh"]);
  });
});
