/**
 * Progress and delay report rules. A report's content is frozen into a snapshot when issued;
 * the PDF is built only from that snapshot so every issue can be reproduced and never changes.
 */
export type ReportModule = "progress_reports" | "delay_reports";

export interface ReportField { key: string; label: string; kind: "date" | "text" | "long" | "number" }

export const REPORT_FIELDS: Record<ReportModule, ReportField[]> = {
  progress_reports: [
    { key: "period_start", label: "Period from", kind: "date" },
    { key: "period_end", label: "Period to", kind: "date" },
    { key: "summary", label: "Summary", kind: "long" },
    { key: "completed", label: "Work completed", kind: "long" },
    { key: "planned", label: "Work planned for next period", kind: "long" },
    { key: "issues", label: "Issues and risks", kind: "long" },
  ],
  delay_reports: [
    { key: "event_date", label: "Date delay first identified", kind: "date" },
    { key: "description", label: "Description of the delay", kind: "long" },
    { key: "cause", label: "Stated cause", kind: "long" },
    { key: "affected", label: "Work or areas affected", kind: "long" },
    { key: "estimated_days", label: "Estimated delay (working days, estimate only)", kind: "number" },
    { key: "mitigation", label: "Mitigation and next steps", kind: "long" },
  ],
};

export const REPORT_LABEL: Record<ReportModule, string> = { progress_reports: "Progress report", delay_reports: "Delay report" };

/** Printed on every delay report: recording a delay is not a claim or award of time. */
export const DELAY_DISCLAIMER =
  "This report records a delay event and its estimated effect. It is not a notice, claim or award of an extension of time, and it does not assess entitlement, responsibility or cost.";
export const ISSUE_NOTE = "Issued copy. This document does not change after issue; later updates are issued as a new issue number.";

export interface ReportPhoto { fileId: string; version: number; caption: string }
export interface ReportSnapshot {
  module: ReportModule;
  reference: string;
  title: string;
  project: { reference: string; name: string };
  fields: Record<string, string>;
  photos: ReportPhoto[];
}

export const MAX_REPORT_PHOTOS = 12;

/** Problems that stop a report being issued; empty means it can be issued. */
export function reportProblems(s: Pick<ReportSnapshot, "module" | "fields" | "photos">): string[] {
  const f = s.fields;
  const out: string[] = [];
  const dateOk = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (s.module === "progress_reports") {
    if (!dateOk(f["period_start"]) || !dateOk(f["period_end"])) out.push("Enter the reporting period.");
    else if (f["period_end"]! < f["period_start"]!) out.push("The period must end on or after its start.");
    if (!f["summary"]?.trim()) out.push("Write a summary.");
  } else {
    if (!dateOk(f["event_date"])) out.push("Enter the date the delay was first identified.");
    if (!f["description"]?.trim()) out.push("Describe the delay.");
    const d = f["estimated_days"]?.trim();
    if (d && !/^\d{1,4}(\.\d)?$/.test(d)) out.push("Estimated delay must be a number of working days.");
  }
  if (s.photos.length > MAX_REPORT_PHOTOS) out.push(`Choose up to ${MAX_REPORT_PHOTOS} photos.`);
  return out;
}

/** Stable text form of a snapshot (sorted keys), used for the duplicate-issue hash. */
export function canonicalSnapshot(s: ReportSnapshot): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(s));
}

/** Standard PDF fonts only cover Western European characters; replace the rest so nothing breaks. */
export function pdfSafe(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(/[^\n\x20-\x7E\xA0-\xFF£€]/g, "?");
}

/** Greedy word wrap by measured width; long words are broken. Keeps blank lines. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (measure(word) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (measure(next) > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export const reportFileName = (reference: string, issueNo: number) => `${reference}-issue-${String(issueNo).padStart(2, "0")}.pdf`;
