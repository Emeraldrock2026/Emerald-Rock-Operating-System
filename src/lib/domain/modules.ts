/** Central catalogue of implemented, switchable modules. Identifiers are stable. */
const CP = ["clients_projects"] as const;
/**
 * kind "business" modules work across the business; kind "project" modules are chosen per project
 * from those the platform admin has switched on. built=false means its pages aren't built yet.
 */
export const MODULES = {
  clients_projects: { name: "Clients & Projects", dependsOn: [], kind: "business", built: true },
  resource_planning: { name: "Resource Planning", dependsOn: CP, kind: "business", built: true },
  commercial: { name: "Commercial", dependsOn: CP, kind: "business", built: true },
  progress_reports: { name: "Progress reports", dependsOn: CP, kind: "project", built: false },
  photos: { name: "Photos", dependsOn: CP, kind: "project", built: false },
  delay_reports: { name: "Delay reports", dependsOn: CP, kind: "project", built: false },
  qa: { name: "QA", dependsOn: CP, kind: "project", built: false },
  handover: { name: "Handover", dependsOn: CP, kind: "project", built: false },
  rams: { name: "RAMS and risk assessments", dependsOn: CP, kind: "project", built: false },
  deliveries: { name: "Deliveries", dependsOn: CP, kind: "project", built: false },
  programmes: { name: "Programmes", dependsOn: CP, kind: "project", built: false },
  documents: { name: "Documents", dependsOn: CP, kind: "project", built: false },
  early_warnings: { name: "Early warnings", dependsOn: CP, kind: "project", built: false },
  rfis: { name: "RFIs", dependsOn: CP, kind: "project", built: false },
  procurement: { name: "Procurement", dependsOn: CP, kind: "project", built: false },
  assets_plant: { name: "Assets and plant", dependsOn: CP, kind: "project", built: false },
  drawings: { name: "Drawings", dependsOn: CP, kind: "project", built: false },
  change_control: { name: "Change control", dependsOn: CP, kind: "project", built: false },
} as const satisfies Record<string, { name: string; dependsOn: readonly string[]; kind: "business" | "project"; built: boolean }>;

export type ModuleId = keyof typeof MODULES;

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export const BUSINESS_MODULE_IDS = MODULE_IDS.filter((m) => MODULES[m].kind === "business");
export const PROJECT_MODULE_IDS = MODULE_IDS.filter((m) => MODULES[m].kind === "project") as ProjectModuleId[];
export type ProjectModuleId = { [K in ModuleId]: (typeof MODULES)[K]["kind"] extends "project" ? K : never }[ModuleId];

export function isProjectModuleId(value: string): value is ProjectModuleId {
  return isModuleId(value) && MODULES[value].kind === "project";
}

export function isModuleId(value: string): value is ModuleId {
  return value in MODULES;
}

/** Enabling is blocked while any dependency is disabled. */
export function checkEnable(
  id: ModuleId,
  enabled: ReadonlySet<ModuleId>,
): { ok: true } | { ok: false; missingDependencies: ModuleId[] } {
  const missing = (MODULES[id].dependsOn as readonly ModuleId[]).filter((d) => !enabled.has(d));
  return missing.length ? { ok: false, missingDependencies: missing } : { ok: true };
}

/** Disabling is blocked while any enabled module depends on this one. */
export function checkDisable(
  id: ModuleId,
  enabled: ReadonlySet<ModuleId>,
): { ok: true } | { ok: false; blockedBy: ModuleId[] } {
  const blockedBy = MODULE_IDS.filter(
    (m) => enabled.has(m) && (MODULES[m].dependsOn as readonly ModuleId[]).includes(id),
  );
  return blockedBy.length ? { ok: false, blockedBy } : { ok: true };
}

/** Plain-English reason a switch can't change right now, or null if it can. */
export function switchBlockedReason(id: ModuleId, enabled: ReadonlySet<ModuleId>): string | null {
  const names = (ids: readonly ModuleId[]) => ids.map((m) => MODULES[m].name).join(" and ");
  if (enabled.has(id)) {
    const r = checkDisable(id, enabled);
    return r.ok ? null : `Switch off ${names(r.blockedBy)} first.`;
  }
  const r = checkEnable(id, enabled);
  return r.ok ? null : `Needs ${names(r.missingDependencies)} switched on first.`;
}
