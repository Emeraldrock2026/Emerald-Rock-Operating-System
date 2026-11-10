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
};

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
  return informationComplete(input.scope);
}

export function readyToCommence(input: AppointmentReadinessInput): boolean {
  if (input.commencementException && informationComplete(input.commencementException.reason) && informationComplete(input.commencementException.follow_up_on)) return true;
  const po = poStatus(input.terms);
  return appointmentConfirmed(input.executionStatus) === "approved"
    && (po === "approved" || po === "not_required")
    && input.stages.length > 0
    && stageDatesValid(input.stages);
}

export function readyToInvoice(input: AppointmentReadinessInput): boolean {
  return invoicingRouteConfirmed(input.terms) === "approved"
    && informationComplete(input.terms["payment_terms"])
    && informationComplete(input.terms["invoice_recipients"]);
}

// Missing requirements become actions people can own, not vague gaps.
export function missingRequirements(input: AppointmentReadinessInput): string[] {
  const missing: string[] = [];
  if (!informationComplete(input.scope)) missing.push("Confirm the scope of services");
  if (appointmentConfirmed(input.executionStatus) !== "approved") missing.push("Record appointment approval or execution");
  const po = poStatus(input.terms);
  if (po !== "approved" && po !== "not_required") missing.push("Confirm the purchase order position");
  if (invoicingRouteConfirmed(input.terms) !== "approved") missing.push("Confirm the invoice email or portal");
  if (!informationComplete(input.terms["payment_terms"])) missing.push("Confirm the agreed payment terms");
  if (!informationComplete(input.terms["invoice_recipients"])) missing.push("Confirm the invoice recipients");
  if (input.stages.length === 0) missing.push("Add at least one service stage");
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
