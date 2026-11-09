/** Central catalogue of implemented, switchable modules. Identifiers are stable. */
export const MODULES = {
  clients_projects: { name: "Clients & Projects", dependsOn: [] },
  resource_planning: { name: "Resource Planning", dependsOn: ["clients_projects"] },
  commercial: { name: "Commercial", dependsOn: ["clients_projects"] },
} as const satisfies Record<string, { name: string; dependsOn: readonly string[] }>;

export type ModuleId = keyof typeof MODULES;

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

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
