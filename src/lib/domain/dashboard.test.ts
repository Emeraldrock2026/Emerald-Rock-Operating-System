import { describe, expect, it } from "vitest";
import { consolidatedActions, moduleKpis, periodRange, ragFor, type DashboardRecord } from "./dashboard";

const rec = (o: Partial<DashboardRecord>): DashboardRecord => ({ id: o.reference ?? "x", reference: "R", title: "t", module_id: "rfis", status: "open", is_closed: false, due_date: null, created_on: "2026-11-02", closed_on: null, ...o });

describe("periodRange", () => {
  it("this week runs Monday to Sunday", () => expect(periodRange("this_week", "2026-11-11")).toMatchObject({ from: "2026-11-09", to: "2026-11-15" }));
  it("this month covers the whole month", () => expect(periodRange("this_month", "2026-02-10")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" }));
  it("last month crosses the year", () => expect(periodRange("last_month", "2026-01-05")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" }));
  it("custom orders reversed dates and rejects missing ones", () => {
    expect(periodRange("custom", "2026-11-09", { from: "2026-11-20", to: "2026-11-01" })).toMatchObject({ from: "2026-11-01", to: "2026-11-20" });
    expect(periodRange("custom", "2026-11-09", { from: "", to: "2026-11-01" })).toBeNull();
  });
});

describe("moduleKpis", () => {
  const p = periodRange("this_month", "2026-11-09")!;
  const recs = [
    rec({ reference: "A", due_date: "2026-11-01" }),
    rec({ reference: "B", due_date: "2026-11-12" }),
    rec({ reference: "C", is_closed: true, closed_on: "2026-11-05", created_on: "2026-10-01", due_date: "2026-10-02" }),
    rec({ reference: "D", module_id: "qa", due_date: "2026-01-01" }),
  ];
  it("counts open, overdue, due soon, raised and closed in period", () => {
    expect(moduleKpis(recs, ["rfis"], p, "2026-11-09")[0]).toEqual({ module_id: "rfis", open: 2, overdue: 1, dueSoon: 1, raised: 2, closed: 1, rag: "red" });
  });
  it("ignores modules that are not visible", () => {
    expect(moduleKpis(recs, ["rfis"], p, "2026-11-09")).toHaveLength(1);
    expect(consolidatedActions(recs, ["rfis"], "2026-11-09").map((r) => r.reference)).toEqual(["A", "B"]);
  });
  it("rag: red overdue, amber due soon, else green", () => {
    expect([ragFor(1, 0), ragFor(0, 2), ragFor(0, 0)]).toEqual(["red", "amber", "green"]);
  });
});

import { openClosedByModule, segmentRecords, weeklyTrend } from "./dashboard";
describe("charts", () => {
  const p = periodRange("this_month", "2026-11-09")!;
  const recs = [
    rec({ reference: "A", created_on: "2026-11-03" }),
    rec({ reference: "B", created_on: "2026-11-10", is_closed: true, closed_on: "2026-11-11" }),
    rec({ reference: "C", module_id: "qa", created_on: "2026-11-03" }),
    rec({ reference: "D", created_on: "2026-10-20", is_closed: true, closed_on: "2026-11-02" }),
  ];
  it("open vs closed per visible module", () => expect(openClosedByModule(recs, ["rfis"])).toEqual([{ module_id: "rfis", open: 1, closed: 2 }]));
  it("weekly trend uses Monday weeks covering the period", () => {
    const t = weeklyTrend(recs, ["rfis"], p);
    expect(t[0]).toEqual({ week: "2026-10-26", raised: 0, closed: 0 });
    expect(t.find((w) => w.week === "2026-11-02")).toEqual({ week: "2026-11-02", raised: 1, closed: 1 });
    expect(t.find((w) => w.week === "2026-11-09")).toEqual({ week: "2026-11-09", raised: 1, closed: 1 });
  });
  it("segment records match the bar and skip hidden modules", () => {
    expect(segmentRecords(recs, ["rfis"], p, { kind: "week", week: "2026-11-02", series: "raised" }).map((r) => r.reference)).toEqual(["A"]);
    expect(segmentRecords(recs, ["rfis"], p, { kind: "status", module_id: "qa", closed: false })).toEqual([]);
  });
});

import { ageBucket, ageingCounts, qaResultCounts, recordSegment, weeklyEventCounts } from "./dashboard";
describe("ageing, events, QA", () => {
  it("age buckets have inclusive edges", () => {
    expect(ageBucket("2026-11-02", "2026-11-09")).toBe("0_7");
    expect(ageBucket("2026-11-01", "2026-11-09")).toBe("8_30");
    expect(ageBucket("2026-10-10", "2026-11-09")).toBe("8_30");
    expect(ageBucket("2026-09-10", "2026-11-09")).toBe("31_60");
    expect(ageBucket("2026-09-09", "2026-11-09")).toBe("61_plus");
  });
  it("ageing counts only open records of visible modules", () => {
    const rs = [rec({ created_on: "2026-11-01" }), rec({ created_on: "2026-11-01", is_closed: true, closed_on: "2026-11-02" }), rec({ module_id: "qa", created_on: "2026-11-01" })];
    expect(ageingCounts(rs, ["rfis"], "2026-11-09")).toEqual({ "0_7": 0, "8_30": 1, "31_60": 0, "61_plus": 0 });
    expect(recordSegment(rs, ["rfis"], periodRange("this_week", "2026-11-09")!, "2026-11-09", { kind: "age", bucket: "8_30" })).toHaveLength(1);
  });
  it("events are counted by Monday week inside the period", () => {
    const p = periodRange("this_month", "2026-11-09")!;
    const ev = (on: string) => ({ id: on, on, module_id: "photos", target_id: "x", label: "" });
    const w = weeklyEventCounts([ev("2026-11-09"), ev("2026-11-15"), ev("2026-10-31")], p);
    expect(w.find((x) => x.week === "2026-11-09")?.count).toBe(2);
    expect(w.find((x) => x.week === "2026-10-26")?.count).toBe(0);
  });
  it("QA counts by status and keeps closed separate", () => {
    const rs = [rec({ module_id: "qa", status: "passed" }), rec({ module_id: "qa", status: "failed" }), rec({ module_id: "qa", status: "failed" }), rec({ module_id: "qa", status: "closed", is_closed: true })];
    expect(qaResultCounts(rs)).toEqual({ open: 0, passed: 1, failed: 2, closed: 1 });
  });
});
