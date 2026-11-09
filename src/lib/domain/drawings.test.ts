import { describe, expect, it } from "vitest";
import { authorisationNote, compareRevisions, DEFAULT_SCHEME as S, latestRevision, nextRevision, parseScheme, revisionProblem } from "./drawings";

describe("revision sequence", () => {
  it("orders P series before C series", () => {
    expect(compareRevisions("C01", "P09", S)).toBeGreaterThan(0);
    expect(latestRevision(["P01", "C01", "P02"], S)).toBe("C01");
  });
  it("suggests the next number or the first of a later series", () => {
    expect(nextRevision(null, S)).toBe("P01");
    expect(nextRevision("P03", S)).toBe("P04");
    expect(nextRevision("P03", S, 1)).toBe("C01");
  });
  it("supports a letter series", () => {
    const L = { series: ["A-Z"], digits: 2 };
    expect(nextRevision("B", L)).toBe("C");
  });
  it("refuses duplicates, earlier codes and codes outside the sequence", () => {
    expect(revisionProblem("P02", ["P01", "P02"], S)).toMatch(/already exists/);
    expect(revisionProblem("P01", ["P02"], S)).toMatch(/after P02/);
    expect(revisionProblem("X1", [], S)).toMatch(/sequence/);
    expect(revisionProblem("C01", ["P04"], S)).toBeNull();
  });
  it("validates scheme settings", () => {
    expect(parseScheme("p, c", 2)).toEqual({ series: ["P", "C"], digits: 2 });
    expect(typeof parseScheme("P,P", 2)).toBe("string");
  });
});

describe("latest received vs authorised for use", () => {
  it("keeps them distinct", () => {
    expect(authorisationNote("P03", "P02")).toBe("Latest P03 not yet authorised; P02 authorised for use");
    expect(authorisationNote("P03", null)).toBe("Not authorised for use");
    expect(authorisationNote("P03", "P03")).toBe("Latest is authorised");
  });
});
