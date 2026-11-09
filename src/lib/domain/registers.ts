/**
 * Register-style project modules (RFIs, early warnings, programmes, QA, handover, RAMS, deliveries,
 * procurement, assets and plant). Mirrors guard_register_record() in the database,
 * which is the real enforcement. None of these records are contractual notices or programme analysis.
 */
import type { DateOnly } from "./dates";

export type RegisterModule = "rfis" | "early_warnings" | "programmes" | "qa" | "handover" | "rams" | "deliveries" | "procurement" | "assets_plant";
export const REGISTER_MODULES: RegisterModule[] = ["rfis", "early_warnings", "programmes", "qa", "handover", "rams", "deliveries", "procurement", "assets_plant"];
export interface RegisterField { key: string; label: string; kind: "text" | "long" | "date" | "choice"; options?: string[] }
export interface RegisterConfig {
  label: string; singular: string; statuses: string[]; closed: string[]; adminOnly: string[];
  statusLabel: Record<string, string>; firstStatus: string; fields: RegisterField[]; notice: string; usesDueDate: boolean;
  /** Label for the due date column, when used. */
  dueLabel?: string;
  /** Holds one versioned file (stored in project files under this module). */
  file?: { label: string; requiredFor: string[]; lockedIn: string[] };
  /** Text fields that must be filled before entering a status. */
  requires?: { status: string[]; field: string; message: string }[];
}

export const REGISTERS: Record<RegisterModule, RegisterConfig> = {
  rfis: {
    label: "RFIs", singular: "RFI", dueLabel: "Response needed by", requires: [{ status: ["responded", "closed"], field: "response", message: "Record the response first." }], statuses: ["draft", "open", "responded", "closed"], closed: ["closed"], adminOnly: ["closed"],
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
    label: "Early warnings", singular: "Early warning", dueLabel: "Review by", statuses: ["open", "under_review", "closed"], closed: ["closed"], adminOnly: ["closed"],
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
    label: "Programmes", singular: "Programme", file: { label: "Programme file", requiredFor: ["current"], lockedIn: ["current", "superseded"] }, statuses: ["draft", "submitted", "current", "superseded"], closed: ["superseded"], adminOnly: ["current", "superseded"],
    statusLabel: { draft: "Draft", submitted: "Submitted", current: "Current", superseded: "Superseded" }, firstStatus: "draft", usesDueDate: false,
    fields: [
      { key: "revision", label: "Programme revision", kind: "text" },
      { key: "data_date", label: "Data date", kind: "date" },
      { key: "planned_completion", label: "Planned completion shown", kind: "date" },
      { key: "notes", label: "Notes", kind: "long" },
    ],
    notice: "Programmes are stored and tracked as submitted. The app does not analyse logic, float or the critical path.",
  },
  qa: {
    label: "QA", singular: "Inspection", statuses: ["open", "passed", "failed", "closed"], closed: ["closed"], adminOnly: ["closed"],
    statusLabel: { open: "Open", passed: "Passed", failed: "Failed", closed: "Closed" }, firstStatus: "open", usesDueDate: true, dueLabel: "Inspect by",
    requires: [{ status: ["passed", "failed"], field: "result", message: "Record the inspection result first." }],
    fields: [
      { key: "check", label: "Inspection or test", kind: "long" },
      { key: "location", label: "Location or element", kind: "text" },
      { key: "inspected_by", label: "Inspected by", kind: "text" },
      { key: "result", label: "Result and observations", kind: "long" },
      { key: "actions", label: "Remedial actions", kind: "long" },
    ],
    notice: "A QA record notes what was inspected and found. Passing an inspection here is not certification or acceptance of the work under the contract.",
  },
  handover: {
    label: "Handover", singular: "Handover item", statuses: ["not_started", "in_progress", "submitted", "accepted"], closed: ["accepted"], adminOnly: ["accepted"],
    statusLabel: { not_started: "Not started", in_progress: "In progress", submitted: "Submitted", accepted: "Accepted" }, firstStatus: "not_started", usesDueDate: true, dueLabel: "Required by",
    file: { label: "Handover document", requiredFor: ["submitted", "accepted"], lockedIn: ["accepted"] },
    fields: [
      { key: "category", label: "Category", kind: "choice", options: ["O&M manual", "Certificate", "As-built drawing", "Warranty", "Training", "Other"] },
      { key: "provided_by", label: "Provided by", kind: "text" },
      { key: "notes", label: "Notes", kind: "long" },
    ],
    notice: "Tracks handover information. Accepting an item here records that the project team accepted the document; it is not practical completion.",
  },
  rams: {
    label: "RAMS", singular: "RAMS", statuses: ["draft", "submitted", "approved", "rejected", "superseded"], closed: ["rejected", "superseded"], adminOnly: ["approved", "rejected", "superseded"],
    statusLabel: { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected", superseded: "Superseded" }, firstStatus: "draft", usesDueDate: true, dueLabel: "Work starts",
    file: { label: "RAMS document", requiredFor: ["submitted", "approved"], lockedIn: ["approved", "superseded"] },
    fields: [
      { key: "activity", label: "Activity covered", kind: "long" },
      { key: "contractor", label: "Contractor", kind: "text" },
      { key: "review_comments", label: "Review comments", kind: "long" },
    ],
    notice: "Uploading RAMS does not approve them. Only a project admin can approve, after reviewing the document.",
  },
  deliveries: {
    label: "Deliveries", singular: "Delivery", statuses: ["expected", "delivered", "cancelled"], closed: ["delivered", "cancelled"], adminOnly: ["cancelled"],
    statusLabel: { expected: "Expected", delivered: "Delivered", cancelled: "Cancelled" }, firstStatus: "expected", usesDueDate: true, dueLabel: "Required on site",
    fields: [
      { key: "supplier", label: "Supplier", kind: "text" },
      { key: "items", label: "Items", kind: "long" },
      { key: "forecast_on", label: "Forecast delivery", kind: "date" },
      { key: "notes", label: "Notes", kind: "long" },
    ],
    notice: "Forecast dates are as reported by the supplier. A forecast later than the required date is highlighted.",
  },
  procurement: {
    label: "Procurement", singular: "Package", statuses: ["planning", "tendering", "awarded", "ordered", "closed"], closed: ["closed"], adminOnly: ["awarded", "closed"],
    statusLabel: { planning: "Planning", tendering: "Tendering", awarded: "Awarded", ordered: "Ordered", closed: "Closed" }, firstStatus: "planning", usesDueDate: true, dueLabel: "Order needed by",
    requires: [{ status: ["awarded", "ordered"], field: "supplier", message: "Record the selected supplier first." }],
    fields: [
      { key: "scope", label: "Package scope", kind: "long" },
      { key: "invited", label: "Suppliers invited", kind: "long" },
      { key: "supplier", label: "Selected supplier", kind: "text" },
      { key: "order_reference", label: "Order reference", kind: "text" },
    ],
    notice: "Tracks procurement progress only. Order values and commercial terms are not held here.",
  },
  assets_plant: {
    label: "Assets and plant", singular: "Asset", statuses: ["on_site", "off_hired"], closed: ["off_hired"], adminOnly: [],
    statusLabel: { on_site: "On site", off_hired: "Off hired" }, firstStatus: "on_site", usesDueDate: true, dueLabel: "Next inspection due",
    fields: [
      { key: "asset_id", label: "Asset or serial number", kind: "text" },
      { key: "supplier", label: "Owner or hire company", kind: "text" },
      { key: "on_hire", label: "On hire from", kind: "date" },
      { key: "notes", label: "Notes", kind: "long" },
    ],
    notice: "Inspection dates here are reminders. This is not a statutory inspection record or thorough examination report.",
  },
};

/** Statuses a user may move a record to from its current status. */
export function nextStatuses(module: RegisterModule, status: string, canManage: boolean): string[] {
  const c = REGISTERS[module];
  return c.statuses.filter((s) => s !== status && (canManage || (!c.adminOnly.includes(s) && !c.adminOnly.includes(status)))
    // A package is only ordered after it has been awarded (guard_procurement_order).
    && !(module === "procurement" && s === "ordered" && status !== "awarded"));
}

/** Why a record can't move to a status, or null when it can. */
export function statusProblem(module: RegisterModule, to: string, fields: Record<string, unknown>): string | null {
  const c = REGISTERS[module];
  for (const r of c.requires ?? []) if (r.status.includes(to) && !String(fields[r.field] ?? "").trim()) return r.message;
  if (c.file?.requiredFor.includes(to) && !fields["file_id"]) return module === "programmes" ? "Upload the programme file first." : "Upload the document first.";
  return null;
}

/** A file can be replaced unless the record is accepted, approved, current or superseded. */
export function fileReplaceable(module: RegisterModule, status: string): boolean {
  const f = REGISTERS[module].file;
  return !!f && !f.lockedIn.includes(status);
}

/** Open delivery whose forecast is later than the date it is needed on site. */
export function isLateForecast(required: DateOnly | null, forecast: DateOnly | null, closed: boolean): boolean {
  return !closed && !!required && !!forecast && forecast > required;
}

export function isOverdue(due: DateOnly | null, today: DateOnly, closed: boolean): boolean {
  return !!due && !closed && due < today;
}
