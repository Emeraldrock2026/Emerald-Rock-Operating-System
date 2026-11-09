/** Platform-level view of how far a business has got with setup. Contains no operational data. */
export interface TenantSetupFacts {
  status: "active" | "suspended";
  ownersActive: number;
  ownersInvited: number;
  modulesEnabled: readonly string[];
}

export type SetupStage = "suspended" | "needs_owner" | "owner_invited" | "needs_modules" | "ready";

export const SETUP_STAGE_LABEL: Record<SetupStage, string> = {
  suspended: "Suspended",
  needs_owner: "Needs an Owner/Admin",
  owner_invited: "Waiting for Owner/Admin to sign in",
  needs_modules: "No modules switched on",
  ready: "Ready",
};

export function setupStage(f: TenantSetupFacts): SetupStage {
  if (f.status === "suspended") return "suspended";
  if (f.ownersActive === 0) return f.ownersInvited > 0 ? "owner_invited" : "needs_owner";
  if (f.modulesEnabled.length === 0) return "needs_modules";
  return "ready";
}

export interface SetupStep {
  label: string;
  done: boolean;
}

export function setupSteps(f: TenantSetupFacts): SetupStep[] {
  return [
    { label: "Business created", done: true },
    { label: "Owner/Admin invited", done: f.ownersActive + f.ownersInvited > 0 },
    { label: "Owner/Admin has signed in", done: f.ownersActive > 0 },
    { label: "At least one module switched on", done: f.modulesEnabled.length > 0 },
  ];
}

/** Matches the database rule: starts with a letter, 2–6 capital letters or digits. */
export function normaliseProjectPrefix(raw: string): string | null {
  const p = raw.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{1,5}$/.test(p) ? p : null;
}
