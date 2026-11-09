import type { ModuleId } from "./modules";

export type TenantRole = "owner_admin" | "resource_manager" | "employee";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

export interface MembershipContext {
  role: TenantRole;
  status: MembershipStatus;
  /** Separate grant; never implied by Resource Manager. Owner/Admin always has it. */
  commercialAccess: boolean;
  tenantActive: boolean;
  enabledModules: ReadonlySet<ModuleId>;
}

export type Permission =
  | "tenant.settings.manage"
  | "tenant.users.manage"
  | "tenant.audit.view"
  | "employees.view_all"
  | "employees.manage"
  | "clients.view"
  | "clients.manage"
  | "projects.view_all"
  | "projects.view_allocated"
  | "projects.manage"
  | "allocations.view_all"
  | "allocations.view_own"
  | "allocations.manage"
  | "commercial.view"
  | "commercial.edit";

/** Module each permission belongs to; core permissions have none. */
const PERMISSION_MODULE: Partial<Record<Permission, ModuleId>> = {
  "clients.view": "clients_projects",
  "clients.manage": "clients_projects",
  "projects.view_all": "clients_projects",
  "projects.view_allocated": "clients_projects",
  "projects.manage": "clients_projects",
  "allocations.view_all": "resource_planning",
  "allocations.view_own": "resource_planning",
  "allocations.manage": "resource_planning",
  "commercial.view": "commercial",
  "commercial.edit": "commercial",
};

const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  owner_admin: [
    "tenant.settings.manage",
    "tenant.users.manage",
    "tenant.audit.view",
    "employees.view_all",
    "employees.manage",
    "clients.view",
    "clients.manage",
    "projects.view_all",
    "projects.view_allocated",
    "projects.manage",
    "allocations.view_all",
    "allocations.view_own",
    "allocations.manage",
    "commercial.view",
    "commercial.edit",
  ],
  resource_manager: [
    "employees.view_all",
    "employees.manage",
    "clients.view",
    "clients.manage",
    "projects.view_all",
    "projects.view_allocated",
    "projects.manage",
    "allocations.view_all",
    "allocations.view_own",
    "allocations.manage",
  ],
  employee: ["projects.view_allocated", "allocations.view_own"],
};

const COMMERCIAL: readonly Permission[] = ["commercial.view", "commercial.edit"];

/**
 * Mirror of the database rules, used for navigation and UI decisions.
 * The database policies remain the source of truth.
 */
export function can(ctx: MembershipContext, permission: Permission): boolean {
  if (!ctx.tenantActive || ctx.status !== "active") return false;
  const mod = PERMISSION_MODULE[permission];
  if (mod && !ctx.enabledModules.has(mod)) return false;
  if (ROLE_PERMISSIONS[ctx.role].includes(permission)) return true;
  return ctx.role === "resource_manager" && ctx.commercialAccess && COMMERCIAL.includes(permission);
}
