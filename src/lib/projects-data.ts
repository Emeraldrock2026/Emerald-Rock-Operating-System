import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const clientsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, contact_email, active, version")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "projects"],
    queryFn: async () => {
      const [res, names] = await Promise.all([
        supabase
          .from("projects")
          .select("id, reference, name, client_id, project_manager_id, status, start_date, planned_finish_date, scope, version")
          .eq("tenant_id", tenantId)
          .order("reference", { ascending: false }),
        supabase.rpc("my_project_client_names", { _tenant: tenantId }),
      ]);
      if (res.error) throw res.error;
      if (names.error) throw names.error;
      const clientName = new Map((names.data ?? []).map((r) => [r.project_id, r.client_name]));
      return (res.data ?? []).map((p) => ({ ...p, client_name: clientName.get(p.id) ?? null }));
    },
  });

export type ProjectRow = Awaited<ReturnType<NonNullable<ReturnType<typeof projectsQuery>["queryFn"]>>>[number];
