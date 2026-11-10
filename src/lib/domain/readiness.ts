// Appointment and onboarding readiness rules. Pure functions: the UI and any server
// checks share these so "ready" means the same thing everywhere. Placeholder text
// ("TBA", "unknown", …) never counts as complete — see informationComplete.
import { informationComplete } from "./client-profile";
import type { ServiceStage } from "./appointments";
import { stageDatesValid } from "./appointments";

export type ReadinessState = "missing" | "awaiting_verification" | "awaiting_approval" | "approved" | "not_required" | "exception";

export type AppointmentReadinessInput = {
  scope: string;
  executionStatus: string; // pending | unsigned | executed
  stages: ServiceStage[];
  terms: Record<string, string>;
  commencementException?: { authorised_by: string; reason: string; follow_up_on: string } | null;
  poDocumentLinked?: boolean;
  requirements?: ReadinessRequirements;
};

// Business-configurable checks. Defaults keep previous behaviour; a PO document is
// optional unless the business switches it on. Unknown/non-boolean values fall back.
export const READINESS_REQUIREMENTS = [
  ["proposal_scope", "Proposal: scope of services confirmed", true],
  ["commence_executed", "Commencement: appointment executed", true],
  ["commence_po", "Commencement: purchase order confirmed or not required", true],
  ["commence_po_document", "Commencement: PO document attached when a PO is required", false],
  ["commence_stages", "Commencement: at least one dated service stage", true],
  ["invoice_route", "Invoicing: invoice email or portal confirmed", true],
  ["invoice_payment_terms", "Invoicing: payment terms confirmed", true],
  ["invoice_recipients", "Invoicing: invoice recipients confirmed", true],
] as const;
export type ReadinessRequirementKey = (typeof READINESS_REQUIREMENTS)[number][0];
export type ReadinessRequirements = Record<ReadinessRequirementKey, boolean>;

export function readinessRequirements(config: unknown): ReadinessRequirements {
  const c = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  return Object.fromEntries(READINESS_REQUIREMENTS.map(([k, , d]) => [k, typeof c[k] === "boolean" ? c[k] : d])) as ReadinessRequirements;
}
const req = (i: AppointmentReadinessInput) => i.requirements ?? readinessRequirements({});
const poNeedsDocument = (i: AppointmentReadinessInput) => req(i).commence_po_document && i.terms["po_required"] !== "no" && !i.poDocumentLinked;

export function appointmentConfirmed(executionStatus: string): ReadinessState {
  if (executionStatus === "executed") return "approved";
  if (executionStatus === "unsigned") return "awaiting_approval";
  return "missing";
}

export function poStatus(terms: Record<string, string>): ReadinessState {
  const required = terms["po_required"];
  if (required === "no") return "not_required";
  if (terms["po_status"] === "yes" && informationComplete(terms["po_number"])) return "approved";
  if (required === "pending" || !required) return "awaiting_verification";
  return "missing";
}

export function invoicingRouteConfirmed(terms: Record<string, string>): ReadinessState {
  return informationComplete(terms["invoice_route"]) ? "approved" : "missing";
}

export function readyToPrepareProposal(input: AppointmentReadinessInput): boolean {
  return !req(input).proposal_scope || informationComplete(input.scope);
}

export function readyToCommence(input: AppointmentReadinessInput): boolean {
  if (input.commencementException && informationComplete(input.commencementException.reason) && informationComplete(input.commencementException.follow_up_on)) return true;
  const r = req(input);
  const po = poStatus(input.terms);
  return (!r.commence_executed || appointmentConfirmed(input.executionStatus) === "approved")
    && (!r.commence_po || po === "approved" || po === "not_required")
    && !poNeedsDocument(input)
    && (!r.commence_stages || input.stages.length > 0)
    && stageDatesValid(input.stages);
}

export function readyToInvoice(input: AppointmentReadinessInput): boolean {
  const r = req(input);
  return (!r.invoice_route || invoicingRouteConfirmed(input.terms) === "approved")
    && (!r.invoice_payment_terms || informationComplete(input.terms["payment_terms"]))
    && (!r.invoice_recipients || informationComplete(input.terms["invoice_recipients"]));
}

// Missing requirements become actions people can own, not vague gaps.
export function missingRequirements(input: AppointmentReadinessInput): string[] {
  const missing: string[] = [];
  const r = req(input);
  if (r.proposal_scope && !informationComplete(input.scope)) missing.push("Confirm the scope of services");
  if (r.commence_executed && appointmentConfirmed(input.executionStatus) !== "approved") missing.push("Record appointment approval or execution");
  const po = poStatus(input.terms);
  if (r.commence_po && po !== "approved" && po !== "not_required") missing.push("Confirm the purchase order position");
  if (poNeedsDocument(input)) missing.push("Attach the purchase order document");
  if (r.invoice_route && invoicingRouteConfirmed(input.terms) !== "approved") missing.push("Confirm the invoice email or portal");
  if (r.invoice_payment_terms && !informationComplete(input.terms["payment_terms"])) missing.push("Confirm the agreed payment terms");
  if (r.invoice_recipients && !informationComplete(input.terms["invoice_recipients"])) missing.push("Confirm the invoice recipients");
  if (r.commence_stages && input.stages.length === 0) missing.push("Add at least one service stage");
  return missing;
}

export const READINESS_LABEL: Record<ReadinessState, string> = {
  missing: "Missing",
  awaiting_verification: "Awaiting verification",
  awaiting_approval: "Awaiting approval",
  approved: "Confirmed",
  not_required: "Not required",
  exception: "Authorised exception",
};
