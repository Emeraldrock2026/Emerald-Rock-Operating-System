/**
 * AI drawing comparison rules. Model output is only ever a list of proposed observations:
 * it is cleaned here before saving, and a reviewer accepts, amends or rejects each one.
 * Nothing here approves a change, grants entitlement or puts a value on it.
 */
export const FINDING_CATEGORIES = ["added", "removed", "moved", "dimension", "annotation", "specification", "other"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingDecision = "proposed" | "accepted" | "amended" | "rejected";

export interface CleanFinding { category: FindingCategory; location: string; summary: string; fingerprint: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same category, location and wording (ignoring case and punctuation) = the same finding on a rerun. */
export function fingerprintFinding(f: { category: string; location: string; summary: string }): string {
  return `${norm(f.category)}|${norm(f.location)}|${norm(f.summary)}`;
}

export const MAX_FINDINGS = 40;

/** Turns raw model output into safe findings; anything malformed is dropped, never invented. */
export function cleanFindings(raw: unknown): { findings: CleanFinding[]; dropped: number } {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { findings?: unknown }).findings) ? (raw as { findings: unknown[] }).findings : [];
  const out: CleanFinding[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of list) {
    const r = (item ?? {}) as Record<string, unknown>;
    const summary = typeof r["summary"] === "string" ? r["summary"].trim().slice(0, 500) : "";
    const location = typeof r["location"] === "string" ? r["location"].trim().slice(0, 200) : "";
    const cat = typeof r["category"] === "string" ? r["category"].toLowerCase() : "";
    const category = (FINDING_CATEGORIES as readonly string[]).includes(cat) ? (cat as FindingCategory) : "other";
    if (summary.length < 5) { dropped++; continue; }
    const fingerprint = fingerprintFinding({ category, location, summary });
    if (seen.has(fingerprint) || out.length >= MAX_FINDINGS) { dropped++; continue; }
    seen.add(fingerprint);
    out.push({ category, location, summary, fingerprint });
  }
  return { findings: out, dropped };
}

/** Only images and PDFs can be compared. */
export function comparableMime(mime: string): "image" | "pdf" | null {
  if (/^image\/(png|jpe?g|webp|gif)$/i.test(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  return null;
}

export function decisionNeedsText(d: FindingDecision): boolean { return d === "amended"; }

export const DECISION_LABEL: Record<FindingDecision, string> = {
  proposed: "Awaiting review", accepted: "Accepted", amended: "Accepted as amended", rejected: "Rejected",
};
