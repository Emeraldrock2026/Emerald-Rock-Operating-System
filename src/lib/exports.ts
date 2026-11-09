import { supabase } from "@/integrations/supabase/client";
import { formatDateGB, type DateOnly } from "@/lib/domain/dates";
import { impliedRate } from "@/lib/domain/commercial";
import { toCsv, type ExportKind } from "@/lib/domain/exports";
import { PROJECT_STATUS_LABEL } from "@/lib/domain/projects";

/**
 * Builds a CSV from what the database lets this person read. Row-level rules
 * (tenant, module, role, commercial grant) decide the rows; this never widens them.
 */
export async function buildExport(tenantId: string, kind: ExportKind, range: { from: DateOnly; to: DateOnly }): Promise<string> {
  const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? []) as T; };
  const status = (s: string) => (PROJECT_STATUS_LABEL as Record<string, string>)[s] ?? s;

  if (kind === "clients") {
    const rows = must(await supabase.from("clients").select("name, contact_name, contact_email, active").eq("tenant_id", tenantId).order("name"));
    return toCsv(["Client", "Contact", "Email", "Active"], rows.map((c) => [c.name, c.contact_name, c.contact_email, c.active]));
  }
  if (kind === "employees") {
    const rows = must(await supabase.from("employees").select("full_name, job_title, email, active").eq("tenant_id", tenantId).order("full_name"));
    return toCsv(["Name", "Job title", "Email", "Active"], rows.map((e) => [e.full_name, e.job_title, e.email, e.active]));
  }
  const [projects, names] = await Promise.all([
    supabase.from("projects").select("id, reference, name, status, start_date, planned_finish_date").eq("tenant_id", tenantId).order("reference"),
    supabase.rpc("my_project_client_names", { _tenant: tenantId }),
  ]);
  const ps = must(projects);
  const clientOf = new Map(must(names).map((r) => [r.project_id, r.client_name]));
  const byId = new Map(ps.map((p) => [p.id, p]));
  const d = (x: string | null) => (x ? formatDateGB(x) : "");

  if (kind === "projects") {
    return toCsv(["Reference", "Project", "Client", "Status", "Start", "Planned finish"],
      ps.map((p) => [p.reference, p.name, clientOf.get(p.id) ?? "", status(p.status), d(p.start_date), d(p.planned_finish_date)]));
  }
  if (kind === "commercial") {
    const rows = must(await supabase.from("project_commercials").select("project_id, agreed_fee, budget_hours").eq("tenant_id", tenantId));
    return toCsv(["Reference", "Project", "Client", "Status", "Agreed fee (GBP)", "Budget hours", "Implied rate (GBP/hour)"],
      rows.map((r) => {
        const p = byId.get(r.project_id);
        const c = { agreed_fee: r.agreed_fee === null ? null : Number(r.agreed_fee), budget_hours: r.budget_hours === null ? null : Number(r.budget_hours) };
        const rate = impliedRate(c);
        return [p?.reference ?? "", p?.name ?? "", clientOf.get(r.project_id) ?? "", p ? status(p.status) : "", c.agreed_fee, c.budget_hours, rate === null ? null : Math.round(rate * 100) / 100];
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  }
  const [allocs, people] = await Promise.all([
    supabase.from("allocations").select("employee_id, project_id, allocation_date, hours, note, needs_review")
      .eq("tenant_id", tenantId).gte("allocation_date", range.from).lte("allocation_date", range.to).order("allocation_date"),
    supabase.from("employees").select("id, full_name").eq("tenant_id", tenantId),
  ]);
  const nameOf = new Map(must(people).map((e) => [e.id, e.full_name]));
  return toCsv(["Date", "Person", "Project reference", "Project", "Hours", "Note", "Needs review"],
    must(allocs).map((a) => [formatDateGB(a.allocation_date), nameOf.get(a.employee_id) ?? "", byId.get(a.project_id)?.reference ?? "", byId.get(a.project_id)?.name ?? "", Number(a.hours), a.note, a.needs_review]));
}

export function downloadCsv(csv: string, filename: string) {
  // BOM so Excel reads £ and accented names correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
