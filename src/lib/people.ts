import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WeeklyHours, WorkingPattern } from "@/lib/domain/capacity";

export const employeesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, job_title, email, active, user_id, version")
        .eq("tenant_id", tenantId)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

export interface StoredPattern extends WorkingPattern {
  id: string;
}

export const patternsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "working-patterns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("working_patterns")
        .select("id, employee_id, effective_from, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const byEmployee = new Map<string, StoredPattern[]>();
      for (const r of data ?? []) {
        const hours = [r.mon_hours, r.tue_hours, r.wed_hours, r.thu_hours, r.fri_hours, r.sat_hours, r.sun_hours].map(Number) as unknown as WeeklyHours;
        const list = byEmployee.get(r.employee_id) ?? [];
        list.push({ id: r.id, effectiveFrom: r.effective_from, hours });
        byEmployee.set(r.employee_id, list);
      }
      return byEmployee;
    },
  });

export const linkableMembersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["tenant", tenantId, "linkable-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("user_id, email, status")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "invited"])
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
