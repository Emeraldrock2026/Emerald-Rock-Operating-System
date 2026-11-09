import { can, type MembershipContext, type Permission } from "./permissions";
import type { DateOnly } from "./dates";

export type ExportKind = "clients" | "projects" | "employees" | "allocations" | "commercial";

interface ExportDef { kind: ExportKind; label: string; needs: Permission; description: string }

const DEFS: readonly ExportDef[] = [
  { kind: "clients", label: "Clients", needs: "clients.view", description: "Client names, contacts and status." },
  { kind: "projects", label: "Projects", needs: "projects.view_allocated", description: "References, clients, status and dates. No fees." },
  { kind: "employees", label: "People", needs: "employees.view_all", description: "Names, job titles, emails and status." },
  { kind: "allocations", label: "Allocations", needs: "allocations.view_own", description: "Daily hours by person and project for a date range." },
  { kind: "commercial", label: "Fees and budget hours", needs: "commercial.view", description: "Agreed fee, budget hours and implied rate per project." },
];

/** Exports this person may download; mirrors module switches and the commercial grant. */
export function availableExports(ctx: MembershipContext | null): ExportDef[] {
  if (!ctx) return [];
  return DEFS.filter((d) => can(ctx, d.needs));
}

export type OverviewCard = "clients_projects" | "team_week" | "my_week" | "commercial" | "exports";

/** Overview cards shown for this person, in display order. */
export function overviewCards(ctx: MembershipContext | null): OverviewCard[] {
  if (!ctx) return [];
  const out: OverviewCard[] = [];
  if (can(ctx, "projects.view_allocated")) out.push("clients_projects");
  if (can(ctx, "allocations.view_all")) out.push("team_week");
  else if (can(ctx, "allocations.view_own")) out.push("my_week");
  if (can(ctx, "commercial.view")) out.push("commercial");
  if (availableExports(ctx).length) out.push("exports");
  return out;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: quoted when needed; text that a spreadsheet would run as a formula is prefixed with '. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportFileName(businessName: string, kind: ExportKind, today: DateOnly): string {
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";
  return `${slug}-${kind}-${today}.csv`;
}
