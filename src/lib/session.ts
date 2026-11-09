import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleId } from "@/lib/domain/modules";
import { isModuleId } from "@/lib/domain/modules";
import type { MembershipContext, MembershipStatus, TenantRole } from "@/lib/domain/permissions";

/** Claims a pre-approved platform admin seat and activates pending invitations. Runs once per user. */
export const bootstrapQuery = (userId: string) =>
  queryOptions({
    queryKey: ["user", userId, "bootstrap"],
    staleTime: Infinity,
    queryFn: async () => {
      const claim = await supabase.rpc("claim_platform_admin");
      if (claim.error) throw claim.error;
      const activate = await supabase.rpc("activate_my_memberships");
      if (activate.error) throw activate.error;
      return { platformAdmin: claim.data === true };
    },
  });

export interface MyMembership {
  id: string;
  tenantId: string;
  role: TenantRole;
  status: MembershipStatus;
  tenant: { displayName: string; businessName: string; status: "active" | "suspended"; isDemo: boolean } | null;
}

export const myMembershipsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["user", userId, "memberships"],
    queryFn: async (): Promise<MyMembership[]> => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, tenant_id, role, status, tenants(display_name, business_name, status, is_demo)")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((m) => ({
        id: m.id,
        tenantId: m.tenant_id,
        role: m.role,
        status: m.status,
        tenant: m.tenants
          ? {
              displayName: m.tenants.display_name,
              businessName: m.tenants.business_name,
              status: m.tenants.status,
              isDemo: m.tenants.is_demo,
            }
          : null,
      }));
    },
  });

export const isPlatformAdminQuery = (userId: string) =>
  queryOptions({
    queryKey: ["user", userId, "platform-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return data === true;
    },
  });

/** A membership the person can actually work in right now. */
export function isUsable(m: MyMembership): boolean {
  return m.status === "active" && m.tenant?.status === "active";
}

export interface TenantContext {
  tenant: {
    id: string;
    businessName: string;
    displayName: string;
    brandColour: string;
    timezone: string;
    baseCurrency: string;
    status: "active" | "suspended";
    isDemo: boolean;
  } | null;
  membership: { id: string; role: TenantRole; status: MembershipStatus; commercialAccess: boolean } | null;
  enabledModules: ModuleId[];
  access: MembershipContext | null;
}

export const tenantContextQuery = (tenantId: string, userId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "context", userId],
    queryFn: async (): Promise<TenantContext> => {
      const [tenantRes, membershipRes, modulesRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, business_name, display_name, brand_colour, timezone, base_currency, status, is_demo")
          .eq("id", tenantId)
          .maybeSingle(),
        supabase
          .from("tenant_memberships")
          .select("id, role, status, commercial_access")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("tenant_modules").select("module_id, enabled").eq("tenant_id", tenantId),
      ]);
      if (tenantRes.error) throw tenantRes.error;
      if (membershipRes.error) throw membershipRes.error;
      if (modulesRes.error) throw modulesRes.error;
      const t = tenantRes.data;
      const m = membershipRes.data;
      const enabledModules = (modulesRes.data ?? [])
        .filter((r) => r.enabled && isModuleId(r.module_id))
        .map((r) => r.module_id as ModuleId);
      return {
        tenant: t
          ? {
              id: t.id,
              businessName: t.business_name,
              displayName: t.display_name,
              brandColour: t.brand_colour,
              timezone: t.timezone,
              baseCurrency: t.base_currency,
              status: t.status,
              isDemo: t.is_demo,
            }
          : null,
        membership: m
          ? { id: m.id, role: m.role, status: m.status, commercialAccess: m.commercial_access }
          : null,
        enabledModules,
        access:
          t && m
            ? {
                role: m.role,
                status: m.status,
                commercialAccess: m.commercial_access,
                tenantActive: t.status === "active",
                enabledModules: new Set(enabledModules),
              }
            : null,
      };
    },
  });

/** Drop cached data for every business except the one being opened. */
export function forgetOtherTenants(queryClient: QueryClient, keepTenantId: string) {
  queryClient.removeQueries({
    predicate: (q) => q.queryKey[0] === "tenant" && q.queryKey[1] !== keepTenantId,
  });
}

export const lastTenantKey = (userId: string) => `ero:last-tenant:${userId}`;
