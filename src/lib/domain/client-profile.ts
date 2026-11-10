export const CLIENT_FIELDS = [
  ["legal_name", "Registered legal name"], ["registration_number", "Company registration number"],
  ["jurisdiction", "Registration jurisdiction"], ["registered_address", "Registered address"],
  ["correspondence_address", "Correspondence address"], ["website", "Website"], ["vat_number", "VAT number"],
  ["division", "Division"], ["regions", "Regions"], ["sectors", "Sectors"], ["client_type", "Client type"],
  ["accounting_contact_id", "Accounting contact ID"], ["relationship_owner", "Relationship owner"],
  ["next_action", "Next action"], ["next_action_due", "Next action due"],
] as const;
export const CONTACT_ROLES = [
  ["relationship", "Primary relationship contact"], ["project", "Project contact"],
  ["commercial", "Commercial lead"], ["fee_approver", "Appointment / fee approver"],
  ["timesheet_approver", "Timesheet approver"], ["invoice_approver", "Invoice approver"],
  ["accounts_payable", "Accounts payable"], ["payment_escalation", "Payment escalation"],
] as const;
export function profileObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
export function informationComplete(value: string | null | undefined): boolean {
  return Boolean(value?.trim()) && !/^(tba|tbc|unknown|pending|n\/a|to be confirmed|[-?]+)$/i.test(value?.trim() ?? "");
}
export function identityGaps(profile: Record<string, string>) {
  return CLIENT_FIELDS.filter(([key]) => ["legal_name", "registration_number", "jurisdiction", "registered_address"].includes(key) && !informationComplete(profile[key])).map(([, label]) => label);
}
export function validCompanyNumber(number: string, jurisdiction: string): boolean {
  if (!informationComplete(number)) return true;
  if (!["uk", "united kingdom", "england and wales", "scotland", "northern ireland"].includes(jurisdiction.toLowerCase())) return true; // Not an unsupported registry claim.
  return /^([0-9]{8}|[A-Z]{2}[0-9]{6}|[A-Z]{2}[0-9]{5}[A-Z0-9])$/i.test(number);
}
export function liveProjectCount(projects: readonly { status: string }[]) {
  return projects.filter((p) => p.status === "active" || p.status === "on_hold").length;
}
// Flags contacts that may be the same person (shared email or identical name within one
// client) for human review. Never merge automatically: a shared name alone is not proof.
export function duplicateContactIds(contacts: readonly { id: string; name: string; email: string | null }[]): Set<string> {
  const flagged = new Set<string>();
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i]!, b = contacts[j]!;
      const sameEmail = Boolean(a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase());
      const sameName = a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
      if (sameEmail || sameName) { flagged.add(a.id); flagged.add(b.id); }
    }
  }
  return flagged;
}