/**
 * Drawing register rules. A revision code is a series prefix plus a zero-padded number (P01, C02)
 * or, for a series written "A-Z", a single letter. "Latest received" is the highest revision by
 * series order then number; "authorised for use" is a separate, explicit decision.
 */
export interface RevisionScheme { series: string[]; digits: number }
export const DEFAULT_SCHEME: RevisionScheme = { series: ["P", "C"], digits: 2 };

export interface ParsedRevision { seriesIndex: number; n: number }

export function parseRevision(code: string, s: RevisionScheme): ParsedRevision | null {
  const c = code.trim().toUpperCase();
  for (let i = 0; i < s.series.length; i++) {
    const p = s.series[i]!.toUpperCase();
    if (p === "A-Z") { if (/^[A-Z]$/.test(c)) return { seriesIndex: i, n: c.charCodeAt(0) - 64 }; continue; }
    const m = new RegExp(`^${p.replace(/[^A-Z0-9]/g, "")}(\\d{${s.digits}})$`).exec(c);
    if (m) { const n = Number(m[1]); if (n >= 1) return { seriesIndex: i, n }; }
  }
  return null;
}

export function formatRevision(r: ParsedRevision, s: RevisionScheme): string {
  const p = s.series[r.seriesIndex]!.toUpperCase();
  if (p === "A-Z") return String.fromCharCode(64 + r.n);
  return p + String(r.n).padStart(s.digits, "0");
}

export function compareRevisions(a: string, b: string, s: RevisionScheme): number {
  const pa = parseRevision(a, s), pb = parseRevision(b, s);
  if (!pa || !pb) return a.localeCompare(b);
  return pa.seriesIndex - pb.seriesIndex || pa.n - pb.n;
}

/** Suggested next revision in the given series (defaults to the latest's series, or the first). */
export function nextRevision(latest: string | null, s: RevisionScheme, seriesIndex?: number): string {
  const p = latest ? parseRevision(latest, s) : null;
  const idx = seriesIndex ?? p?.seriesIndex ?? 0;
  if (!p || idx > p.seriesIndex) return formatRevision({ seriesIndex: idx, n: 1 }, s);
  return formatRevision({ seriesIndex: p.seriesIndex, n: p.n + 1 }, s);
}

/** Why a proposed new revision can't be accepted, or null when it can. */
export function revisionProblem(code: string, existing: string[], s: RevisionScheme): string | null {
  if (!parseRevision(code, s)) return `Revision must follow the sequence ${describeScheme(s)}.`;
  if (existing.some((e) => e.toUpperCase() === code.trim().toUpperCase())) return "That revision already exists for this drawing.";
  const latest = latestRevision(existing, s);
  if (latest && compareRevisions(code, latest, s) <= 0) return `New revision must come after ${latest}.`;
  return null;
}

export function latestRevision(codes: string[], s: RevisionScheme): string | null {
  return codes.reduce<string | null>((best, c) => (best === null || compareRevisions(c, best, s) > 0 ? c : best), null);
}

export function describeScheme(s: RevisionScheme): string {
  return s.series.map((p) => (p.toUpperCase() === "A-Z" ? "A, B, C…" : `${p}${"0".repeat(s.digits - 1)}1, ${p}${"0".repeat(s.digits - 1)}2…`)).join(" then ");
}

export function parseScheme(input: string, digits: number): RevisionScheme | string {
  const series = input.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  if (series.length === 0) return "Give at least one series.";
  if (series.some((x) => x !== "A-Z" && !/^[A-Z]{1,3}$/.test(x))) return "Each series is 1–3 letters, or A-Z.";
  if (new Set(series).size !== series.length) return "Series must be different.";
  if (!Number.isInteger(digits) || digits < 1 || digits > 3) return "Digits must be 1 to 3.";
  return { series, digits };
}

/** Status shown when latest received and authorised for use differ. */
export function authorisationNote(latest: string | null, authorised: string | null): string {
  if (!latest) return "No revisions received";
  if (!authorised) return "Not authorised for use";
  if (authorised === latest) return "Latest is authorised";
  return `Latest ${latest} not yet authorised; ${authorised} authorised for use`;
}
