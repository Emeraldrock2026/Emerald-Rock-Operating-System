import type { DateOnly } from "./dates";

export type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

/** Tenant prefix rules: 2–6 capital letters or digits, starting with a letter. */
export function isValidProjectPrefix(prefix: string): boolean {
  return /^[A-Z][A-Z0-9]{1,5}$/.test(prefix);
}

/** e.g. ("ERC", 1) -> "ERC-0001". Sequence numbers are never reused. */
export function formatProjectReference(prefix: string, sequence: number): string {
  if (!isValidProjectPrefix(prefix)) throw new Error(`Invalid project prefix: ${prefix}`);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("Sequence must be 1 or more");
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

/** Whether a project in this status can receive a new allocation. */
export function allocationPolicyForStatus(status: ProjectStatus): "allowed" | "confirm" | "blocked" {
  if (status === "active") return "allowed";
  if (status === "on_hold") return "confirm";
  return "blocked";
}

/** True when the allocation date falls outside the project's planned dates. */
export function isOutsidePlannedDates(
  date: DateOnly,
  start: DateOnly | null,
  plannedFinish: DateOnly | null,
): boolean {
  return (start !== null && date < start) || (plannedFinish !== null && date > plannedFinish);
}
