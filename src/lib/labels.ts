import type { MembershipStatus, TenantRole } from "@/lib/domain/permissions";

export const ROLE_LABEL: Record<TenantRole, string> = {
  owner_admin: "Owner/Admin",
  resource_manager: "Resource Manager",
  employee: "Employee",
};

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

/** Only one environment exists today; change this when a separate live environment is set up. */
export const ENVIRONMENT_LABEL = "Test environment";
