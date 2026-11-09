import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const key = (tenantId: string, projectId: string, part: string) => ["tenant", tenantId, "project", projectId, part] as const;

export const projectDetailQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "detail"),
    queryFn: async () => {
      const [p, role] = await Promise.all([
        supabase.from("projects").select("id, description, site_address, contract_form, contract_reference, contract_notes, template_id, version").eq("id", projectId).maybeSingle(),
        supabase.rpc("project_role_of", { _tenant: tenantId, _project: projectId }),
      ]);
      if (p.error) throw p.error;
      if (role.error) throw role.error;
      return { project: p.data, myRole: (role.data as string | null) ?? null };
    },
  });

export const projectTeamQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "team"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_team").select("id, employee_id, project_role, version, employees(full_name, job_title)").eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectOrgsQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "orgs"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_organisations").select("id, name, org_role, contact_name, contact_email, contact_phone, version").eq("project_id", projectId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectKeyDatesQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "key-dates"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_key_dates").select("id, label, due_on, achieved_on, version").eq("project_id", projectId).order("due_on");
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectModulesQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "modules"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_modules").select("module_id, enabled").eq("project_id", projectId);
      if (error) throw error;
      return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.module_id));
    },
  });

export const projectRecordsQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "records"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_records")
        .select("id, reference, title, module_id, status, is_closed, due_date, responsible_employee_id")
        .eq("project_id", projectId).eq("is_closed", false).order("due_date", { nullsFirst: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectActivityQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "activity"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("project_activity", { _project: projectId, _limit: 15 });
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectTemplatesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "project-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_templates").select("id, name, description, module_ids, folder_paths, active, version").eq("tenant_id", tenantId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const projectFoldersQuery = (tenantId: string, projectId: string) =>
  queryOptions({
    queryKey: key(tenantId, projectId, "folders"),
    queryFn: async () => {
      const { data, error } = await supabase.from("project_folders").select("id, parent_id, name").eq("project_id", projectId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

/** Folder rows as indented "A / B" paths for display. */
export function folderPaths(rows: { id: string; parent_id: string | null; name: string }[]): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path = (r: { parent_id: string | null; name: string }): string => {
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    return parent ? `${path(parent)} / ${r.name}` : r.name;
  };
  return rows.map(path).sort((a, b) => a.localeCompare(b));
}
