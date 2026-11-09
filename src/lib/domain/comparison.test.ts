import { describe, expect, it } from "vitest";
import { cleanFindings, comparableMime, fingerprintFinding } from "./comparison";

describe("finding fingerprints", () => {
  it("treat case and punctuation changes on a rerun as the same finding", () => {
    expect(fingerprintFinding({ category: "dimension", location: "Grid C/4", summary: "Wall moved 200mm east." }))
      .toBe(fingerprintFinding({ category: "Dimension", location: "grid c 4", summary: "wall moved 200mm EAST" }));
  });
  it("differ when the location differs", () => {
    expect(fingerprintFinding({ category: "added", location: "Level 1", summary: "New door" }))
      .not.toBe(fingerprintFinding({ category: "added", location: "Level 2", summary: "New door" }));
  });
});

describe("cleanFindings", () => {
  it("drops malformed and duplicate items and never invents any", () => {
    const r = cleanFindings({ findings: [
      { category: "added", location: "L1", summary: "New stair core" },
      { category: "ADDED", location: "l1", summary: "new stair core!" },
      { category: "weird", location: "", summary: "Note changed text" },
      { summary: "x" }, null,
    ] });
    expect(r.findings.map((f) => f.category)).toEqual(["added", "other"]);
    expect(r.dropped).toBe(3);
  });
  it("returns nothing for unusable output", () => {
    expect(cleanFindings("not json").findings).toEqual([]);
    expect(cleanFindings({}).findings).toEqual([]);
  });
});

describe("comparableMime", () => {
  it("accepts images and PDFs only", () => {
    expect(comparableMime("image/png")).toBe("image");
    expect(comparableMime("application/pdf")).toBe("pdf");
    expect(comparableMime("application/acad")).toBeNull();
  });
});
