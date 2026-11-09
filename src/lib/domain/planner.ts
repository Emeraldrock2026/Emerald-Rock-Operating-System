import type { DateOnly } from "./dates";
import type { ProjectStatus } from "./projects";

/** Hours must be > 0, at most 24, in steps of 0.25. */
export function parseAllocationHours(raw: string): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter hours greater than 0.");
  if (n > 24) throw new Error("A day can't have more than 24 hours.");
  if (Math.round(n * 4) !== n * 4) throw new Error("Use quarter hours, e.g. 3.5 or 3.75.");
  return n;
}

/** Warnings that need confirmation before booking work. Empty = fine. */
export function allocationWarnings(
  p: { status: ProjectStatus; start_date: DateOnly; planned_finish_date: DateOnly },
  date: DateOnly,
): string[] {
  const w: string[] = [];
  if (date < p.start_date || date > p.planned_finish_date) w.push("This date is outside the project's planned dates.");
  if (p.status === "on_hold") w.push("This project is On Hold.");
  return w;
}

export function canReceiveAllocations(status: ProjectStatus): boolean {
  return status === "active" || status === "on_hold";
}
