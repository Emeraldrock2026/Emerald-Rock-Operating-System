import { MODULES, PROJECT_MODULE_IDS, type ModuleId, type ProjectModuleId } from "./modules";

/** Why a project module can or can't be used on a project. Mirrors project_module_active() in the database. */
export type ProjectModuleState = "active" | "off_for_business" | "off_for_project";

export function projectModuleState(id: ProjectModuleId, businessOn: ReadonlySet<ModuleId>, projectOn: ReadonlySet<string>): ProjectModuleState {
  if (!businessOn.has(id)) return "off_for_business";
  return projectOn.has(id) ? "active" : "off_for_project";
}

/** Modules a project admin may choose from: only those the business has. */
export function selectableProjectModules(businessOn: ReadonlySet<ModuleId>): ProjectModuleId[] {
  return PROJECT_MODULE_IDS.filter((m) => businessOn.has(m));
}

/** What applying a template will do, before it runs. Mirrors apply_project_template(). */
export function templatePreview(templateModules: readonly string[], businessOn: ReadonlySet<ModuleId>) {
  const apply: string[] = [];
  const skipped: string[] = [];
  for (const m of templateModules) (businessOn.has(m as ModuleId) ? apply : skipped).push(m);
  return { apply, skipped };
}

export const MAX_FOLDER_DEPTH = 6;

/** One folder path per line, "/" between levels. Returns cleaned unique paths or an error. */
export function parseFolderPaths(text: string): { ok: true; paths: string[] } | { ok: false; error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("\\")) return { ok: false, error: `"${line}": use / between folder levels, not \\.` };
    const parts = line.split("/").map((p) => p.trim());
    if (parts.some((p) => !p)) return { ok: false, error: `"${line}" has an empty folder name.` };
    if (parts.length > MAX_FOLDER_DEPTH) return { ok: false, error: `"${line}" is more than ${MAX_FOLDER_DEPTH} levels deep.` };
    if (parts.some((p) => p.length > 120)) return { ok: false, error: `"${line}" has a folder name over 120 characters.` };
    const path = parts.join("/");
    const key = path.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(path); }
  }
  return { ok: true, paths: out };
}

export interface DashRecord { id: string; reference: string; title: string; module_id: string; is_closed: boolean; due_date: string | null; responsible_employee_id: string | null }
export interface DashKeyDate { id: string; label: string; due_on: string; achieved_on: string | null }

/** Open records that need doing, overdue first then by due date; undated last. */
export function outstandingActions<T extends DashRecord>(records: readonly T[], today: string) {
  return records
    .filter((r) => !r.is_closed)
    .map((r) => ({ ...r, overdue: !!r.due_date && r.due_date < today }))
    .sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || a.reference.localeCompare(b.reference));
}

/** Key dates not yet achieved and open record due dates within the window (inclusive), plus anything overdue. */
export function upcomingDates(keyDates: readonly DashKeyDate[], records: readonly DashRecord[], today: string, until: string) {
  const items = [
    ...keyDates.filter((k) => !k.achieved_on).map((k) => ({ id: k.id, kind: "key_date" as const, label: k.label, date: k.due_on })),
    ...records.filter((r) => !r.is_closed && r.due_date).map((r) => ({ id: r.id, kind: "record" as const, label: `${r.reference} ${r.title}`, date: r.due_date! })),
  ];
  return items
    .filter((i) => i.date <= until)
    .map((i) => ({ ...i, overdue: i.date < today }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type LinkRestriction = "no_project_access" | "module_off_for_business" | "module_off_for_project" | null;

/** Plain-English explanation for a linked record the person can't open. The link itself is kept. */
export function linkRestrictionMessage(restriction: LinkRestriction, moduleId: string): string | null {
  const name = moduleId in MODULES ? MODULES[moduleId as ModuleId].name : moduleId;
  switch (restriction) {
    case "no_project_access": return "This linked record is on a project you can't see.";
    case "module_off_for_business": return `${name} is switched off for this business, so this linked record can't be opened. It's kept and will reappear when switched back on.`;
    case "module_off_for_project": return `${name} isn't switched on for this project, so this linked record can't be opened. It's kept.`;
    default: return null;
  }
}

export const PROJECT_ROLE_LABEL = { project_admin: "Project admin", member: "Team member", viewer: "Viewer" } as const;
export type ProjectRole = keyof typeof PROJECT_ROLE_LABEL;

export const ORG_ROLE_LABEL = {
  client: "Client", contractor: "Contractor", subcontractor: "Subcontractor", designer: "Designer",
  consultant: "Consultant", supplier: "Supplier", other: "Other",
} as const;
export type OrgRole = keyof typeof ORG_ROLE_LABEL;
