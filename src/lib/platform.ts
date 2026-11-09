import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StaleRecordError } from "@/lib/db-errors";

export interface PlatformTenant {
  id: string;
  businessName: string;
  displayName: string;
  projectPrefix: string;
  status: "active" | "suspended";
  isDemo: boolean;
  createdAt: string;
  version: number;
  ownersActive: number;
  ownersInvited: number;
  membersActive: number;
  modulesEnabled: string[];
}

export const platformTenantsQuery = () =>
  queryOptions({
    queryKey: ["platform", "tenants"],
    queryFn: async (): Promise<PlatformTenant[]> => {
      const { data, error } = await supabase.rpc("platform_tenant_overview");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.tenant_id,
        businessName: r.business_name,
        displayName: r.display_name,
        projectPrefix: r.project_prefix,
        status: r.status,
        isDemo: r.is_demo,
        createdAt: r.created_at,
        version: r.version,
        ownersActive: r.owners_active,
        ownersInvited: r.owners_invited,
        membersActive: r.members_active,
        modulesEnabled: r.modules_enabled ?? [],
      }));
    },
  });

export interface TenantOwner {
  id: string;
  email: string;
  status: "invited" | "active" | "suspended" | "removed";
  invitedAt: string;
  activatedAt: string | null;
}

/** Only Owner/Admin memberships: a platform admin sees who runs a business, not its staff. */
export const tenantOwnersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["platform", "owners", tenantId],
    queryFn: async (): Promise<TenantOwner[]> => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, email, status, invited_at, activated_at")
        .eq("tenant_id", tenantId)
        .eq("role", "owner_admin")
        .neq("status", "removed")
        .order("invited_at");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        email: m.email,
        status: m.status,
        invitedAt: m.invited_at,
        activatedAt: m.activated_at,
      }));
    },
  });

export async function createBusiness(input: { businessName: string; displayName: string; projectPrefix: string }) {
  const { data, error } = await supabase
    .from("tenants")
    .insert({
      business_name: input.businessName,
      display_name: input.displayName,
      project_prefix: input.projectPrefix,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setBusinessStatus(id: string, version: number, status: "active" | "suspended") {
  const { data, error } = await supabase
    .from("tenants")
    .update({ status })
    .eq("id", id)
    .eq("version", version)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new StaleRecordError();
}
