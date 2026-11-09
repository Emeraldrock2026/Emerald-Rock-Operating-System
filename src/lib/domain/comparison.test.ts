import { describe, expect, it } from "vitest";
import { cleanFindings, comparableMime, fingerprintFinding, reuseKnownFingerprints } from "./comparison";

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

describe("reworded findings on a rerun", () => {
  const earlier = [
    { category: "added", location: "Bottom-right corner of meeting room", summary: "Two partitions have been added to form an enclosure labelled 'NEW STORE'.", fingerprint: "fp-store" },
    { category: "annotation", location: "Bottom-right revision label", summary: "The revision label has changed from 'REV P01' to 'REV P02'.", fingerprint: "fp-rev" },
  ];
  const mk = (category: "added" | "annotation", location: string, summary: string) => ({ category, location, summary, fingerprint: fingerprintFinding({ category, location, summary }) });
  it("reuse the earlier finding when only the wording changed", () => {
    const r = reuseKnownFingerprints([mk("added", "Bottom-right corner of meeting room", "Two new partition walls form an enclosure labelled 'NEW STORE'.")], earlier);
    expect(r.map((f) => f.fingerprint)).toEqual(["fp-store"]);
  });
  it("keep a genuinely different finding at the same location", () => {
    const r = reuseKnownFingerprints([mk("added", "Bottom-right corner of meeting room", "A door has been inserted in the east wall.")], earlier);
    expect(r[0]!.fingerprint).not.toBe("fp-store");
  });
  it("never merge across categories or locations", () => {
    const r = reuseKnownFingerprints([mk("added", "Level 2", "Two partitions have been added to form an enclosure labelled 'NEW STORE'.")], earlier);
    expect(r[0]!.fingerprint).not.toBe("fp-store");
  });
});
