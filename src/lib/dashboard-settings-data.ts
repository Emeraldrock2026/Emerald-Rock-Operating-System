import { supabase } from "@/integrations/supabase/client";
import { dashboardSettingsSchema, DEFAULT_DASHBOARD_SETTINGS } from "./domain/dashboard-settings";

export function dashboardSettingsQuery(tenantId: string) {
  return { queryKey: ["tenant", tenantId, "dashboard-settings"], queryFn: async () => {
    const r = await supabase.from("tenant_dashboard_settings").select("config,version").eq("tenant_id", tenantId).maybeSingle();
    if (r.error) throw r.error;
    return { config: r.data ? dashboardSettingsSchema.parse(r.data.config) : DEFAULT_DASHBOARD_SETTINGS, version: r.data?.version ?? null };
  } };
}