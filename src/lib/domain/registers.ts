/**
 * RFIs, early warnings and programmes. Mirrors guard_register_record() in the database,
 * which is the real enforcement. None of these records are contractual notices or programme analysis.
 */
import type { DateOnly } from "./dates";

export type RegisterModule = "rfis" | "early_warnings" | "programmes";
export interface RegisterField { key: string; label: string; kind: "text" | "long" | "date" | "choice"; options?: string[] }
export interface RegisterConfig {
  label: string; singular: string; statuses: string[]; closed: string[]; adminOnly: string[];
  statusLabel: Record<string, string>; firstStatus: string; fields: RegisterField[]; notice: string; usesDueDate: boolean;
}

export const REGISTERS: Record<RegisterModule, RegisterConfig> = {
  rfis: {
    label: "RFIs", singular: "RFI", statuses: ["draft", "open", "responded", "closed"], closed: ["closed"], adminOnly: ["closed"],
    statusLabel: { draft: "Draft", open: "Open", responded: "Responded", closed: "Closed" }, firstStatus: "draft", usesDueDate: true,
    fields: [
      { key: "question", label: "Question", kind: "long" },
      { key: "addressed_to", label: "Addressed to", kind: "text" },
      { key: "response", label: "Response", kind: "long" },
      { key: "responded_by", label: "Responded by", kind: "text" },
    ],
    notice: "An RFI asks for information or clarification. A response recorded here is not an instruction or a change unless issued as one under the contract.",
  },
  early_warnings: {
    label: "Early warnings", singular: "Early warning", statuses: ["open", "under_review", "closed"], closed: ["closed"], adminOnly: ["closed"],
    statusLabel: { open: "Open", under_review: "Under review", closed: "Closed" }, firstStatus: "open", usesDueDate: true,
    fields: [
      { key: "matter", label: "Matter that could affect the project", kind: "long" },
      { key: "possible_effects", label: "Possible effects (time, cost, quality)", kind: "long" },
      { key: "raised_by", label: "Raised by", kind: "text" },
      { key: "actions", label: "Agreed actions", kind: "long" },
    ],
    notice: "Recording an early warning here is not a contractual notice. Give any notice required by the contract in the way the contract requires.",
  },
  programmes: {
    label: "Programmes", singular: "Programme", statuses: ["draft", "submitted", "current", "superseded"], closed: ["superseded"], adminOnly: ["current", "superseded"],
    statusLabel: { draft: "Draft", submitted: "Submitted", current: "Current", superseded: "Superseded" }, firstStatus: "draft", usesDueDate: false,
    fields: [
      { key: "revision", label: "Programme revision", kind: "text" },
      { key: "data_date", label: "Data date", kind: "date" },
      { key: "planned_completion", label: "Planned completion shown", kind: "date" },
      { key: "notes", label: "Notes", kind: "long" },
    ],
    notice: "Programmes are stored and tracked as submitted. The app does not analyse logic, float or the critical path.",
  },
};

/** Statuses a user may move a record to from its current status. */
export function nextStatuses(module: RegisterModule, status: string, canManage: boolean): string[] {
  const c = REGISTERS[module];
  return c.statuses.filter((s) => s !== status && (canManage || (!c.adminOnly.includes(s) && !c.adminOnly.includes(status))));
}

/** Why a record can't move to a status, or null when it can. */
export function statusProblem(module: RegisterModule, to: string, fields: Record<string, unknown>): string | null {
  if (module === "rfis" && (to === "responded" || to === "closed") && !String(fields["response"] ?? "").trim()) return "Record the response first.";
  if (module === "programmes" && to === "current" && !fields["file_id"]) return "Upload the programme file first.";
  return null;
}

export function isOverdue(due: DateOnly | null, today: DateOnly, closed: boolean): boolean {
  return !!due && !closed && due < today;
}
