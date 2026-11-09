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

/** Status changes offered in the UI. Closing still needs future allocations resolved (database guard). */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["active", "archived"],
  active: ["on_hold", "completed"],
  on_hold: ["active", "completed"],
  completed: ["active", "archived"],
  archived: ["draft"],
};

export function allowedStatusTransitions(status: ProjectStatus): readonly ProjectStatus[] {
  return TRANSITIONS[status];
}

export function validateProjectDates(start: DateOnly, plannedFinish: DateOnly): "finish_before_start" | null {
  return plannedFinish < start ? "finish_before_start" : null;
}

export function selectableClients<T extends { active: boolean; id: string }>(clients: readonly T[], currentId?: string | null): T[] {
  return clients.filter((c) => c.active || c.id === currentId);
}

export interface ProjectFilter {
  search?: string | undefined;
  status?: ProjectStatus | "open" | "all" | undefined;
  clientId?: string | undefined;
}

/** "open" = Draft, Active or On Hold. Search matches reference or name, case-insensitive. */
export function filterProjects<T extends { reference: string; name: string; status: ProjectStatus; client_id: string | null }>(
  projects: readonly T[],
  f: ProjectFilter,
): T[] {
  const q = (f.search ?? "").trim().toLowerCase();
  return projects.filter((p) => {
    if (q && !p.reference.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    const s = f.status ?? "open";
    if (s === "open" && !["draft", "active", "on_hold"].includes(p.status)) return false;
    if (s !== "open" && s !== "all" && p.status !== s) return false;
    if (f.clientId && p.client_id !== f.clientId) return false;
    return true;
  });
}
