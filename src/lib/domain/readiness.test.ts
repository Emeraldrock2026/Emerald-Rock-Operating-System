import { describe, expect, it } from "vitest";
import { appointmentConfirmed, invoicingRouteConfirmed, missingRequirements, poStatus, readyToCommence, readyToInvoice, readyToPrepareProposal, readinessRequirements } from "./readiness";

const base = {
  scope: "Tender planning support",
  executionStatus: "executed",
  stages: [{ name: "Tender", scope: "", starts_on: "2026-11-10", ends_on: "2026-12-01" }],
  terms: { po_required: "no", invoice_route: "ap@example.com", payment_terms: "30 days", invoice_recipients: "ap@example.com" },
};

describe("appointment readiness", () => {
  it("confirms an executed appointment and tracks approval states", () => {
    expect(appointmentConfirmed("executed")).toBe("approved");
    expect(appointmentConfirmed("unsigned")).toBe("awaiting_approval");
    expect(appointmentConfirmed("pending")).toBe("missing");
  });
  it("treats PO not required separately from outstanding", () => {
    expect(poStatus({ po_required: "no" })).toBe("not_required");
    expect(poStatus({ po_required: "yes", po_status: "yes", po_number: "PO-123" })).toBe("approved");
    expect(poStatus({ po_required: "yes", po_status: "pending" })).toBe("missing");
    expect(poStatus({})).toBe("awaiting_verification");
  });
  it("never counts placeholder text as complete", () => {
    expect(invoicingRouteConfirmed({ invoice_route: "TBA" })).toBe("missing");
    expect(readyToPrepareProposal({ ...base, scope: "unknown" })).toBe(false);
  });
  it("requires appointment, PO and valid stages before commencement", () => {
    expect(readyToCommence(base)).toBe(true);
    expect(readyToCommence({ ...base, executionStatus: "pending" })).toBe(false);
    expect(readyToCommence({ ...base, stages: [] })).toBe(false);
    expect(readyToCommence({ ...base, terms: { ...base.terms, po_required: "yes", po_status: "pending" } })).toBe(false);
  });
  it("allows commencement only with a complete authorised exception", () => {
    const incomplete = { ...base, executionStatus: "pending" };
    expect(readyToCommence({ ...incomplete, commencementException: { authorised_by: "u", reason: "", follow_up_on: "2026-11-20" } })).toBe(false);
    expect(readyToCommence({ ...incomplete, commencementException: { authorised_by: "u", reason: "Client instruction", follow_up_on: "2026-11-20" } })).toBe(true);
  });
  it("requires route, terms and recipients before invoicing", () => {
    expect(readyToInvoice(base)).toBe(true);
    expect(readyToInvoice({ ...base, terms: { ...base.terms, payment_terms: "" } })).toBe(false);
  });
  it("turns gaps into named actions", () => {
    const missing = missingRequirements({ scope: "", executionStatus: "pending", stages: [], terms: {} });
    expect(missing).toContain("Confirm the scope of services");
    expect(missing).toContain("Record appointment approval or execution");
    expect(missing).toContain("Add at least one service stage");
    expect(missingRequirements(base)).toEqual([]);
  });
});

describe("configurable readiness requirements", () => {
  const po = { ...base, terms: { ...base.terms, po_required: "yes", po_status: "yes", po_number: "PO-9" } };
  it("defaults keep existing checks and leave the PO document optional", () => {
    const r = readinessRequirements({});
    expect(r.commence_executed).toBe(true);
    expect(r.commence_po_document).toBe(false);
    expect(readyToCommence(po)).toBe(true);
  });
  it("ignores non-boolean stored values", () => {
    expect(readinessRequirements({ commence_executed: "no" }).commence_executed).toBe(true);
  });
  it("requires an attached PO document when the business switches it on", () => {
    const requirements = readinessRequirements({ commence_po_document: true });
    expect(readyToCommence({ ...po, requirements })).toBe(false);
    expect(missingRequirements({ ...po, requirements })).toContain("Attach the purchase order document");
    expect(readyToCommence({ ...po, requirements, poDocumentLinked: true })).toBe(true);
    expect(readyToCommence({ ...base, requirements })).toBe(true);
  });
  it("drops a check the business has switched off", () => {
    const requirements = readinessRequirements({ invoice_recipients: false, commence_executed: false });
    expect(readyToInvoice({ ...base, requirements, terms: { ...base.terms, invoice_recipients: "" } })).toBe(true);
    expect(readyToCommence({ ...base, requirements, executionStatus: "pending" })).toBe(true);
    expect(missingRequirements({ ...base, requirements, executionStatus: "pending" })).not.toContain("Record appointment approval or execution");
  });
});
