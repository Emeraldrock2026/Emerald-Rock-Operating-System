import { describe, expect, it } from "vitest";
import { readAllPages } from "./read-all-pages";

describe("complete dashboard reads", () => {
  it("returns every one of 2105 records, beyond the API default and old dashboard limit", async () => {
    const source = Array.from({ length: 2105 }, (_, id) => ({ id }));
    const rows = await readAllPages((from, to) => Promise.resolve({ data: source.slice(from, to + 1), error: null }));
    expect(rows.length).toBe(2105);
    expect(rows[2104]?.id).toBe(2104);
  });
  it("refuses partial totals if a later page fails", async () => {
    await expect(readAllPages((from) => Promise.resolve({ data: from ? null : Array(500).fill(1), error: from ? new Error("Page refused") : null }))).rejects.toThrow("Page refused");
  });
});