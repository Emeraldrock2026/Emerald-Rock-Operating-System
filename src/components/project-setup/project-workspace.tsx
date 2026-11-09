import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { addDays, formatDateGB, formatTimestamp, todayIn } from "@/lib/domain/dates";
import { MODULES, PROJECT_MODULE_IDS, type ModuleId } from "@/lib/domain/modules";
import {
  ORG_ROLE_LABEL, PROJECT_ROLE_LABEL, projectModuleState, templatePreview, upcomingDates,
  type OrgRole, type ProjectRole,
} from "@/lib/domain/project-setup";
import { employeesQuery } from "@/lib/people";
import {
  folderPaths, projectActivityQuery, projectDetailQuery, projectFoldersQuery, projectKeyDatesQuery, projectModulesQuery,
  projectOrgsQuery, projectRecordsQuery, projectTeamQuery, projectTemplatesQuery,
} from "@/lib/project-setup-data";

interface Props { tenantId: string; projectId: string; timezone: string; businessModules: ReadonlySet<ModuleId>; canManage: boolean; isManager: boolean }

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function useInvalidate(tenantId: string, projectId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] });
}

/* ---------------- Dashboard ---------------- */
export function ProjectDashboard({ tenantId, projectId, timezone }: Props) {
  const today = todayIn(timezone);
  const records = useQuery(projectRecordsQuery(tenantId, projectId));
  const dates = useQuery(projectKeyDatesQuery(tenantId, projectId));
  const activity = useQuery(projectActivityQuery(tenantId, projectId));
  const upcoming = upcomingDates(dates.data ?? [], records.data ?? [], today, addDays(today, 28));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Upcoming dates (next 4 weeks)">
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No dates in the next four weeks.</p> : (
          <ul className="space-y-2 text-sm">
            {upcoming.slice(0, 8).map((u) => (
              <li key={u.id} className="flex items-start gap-2">
                {u.overdue ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Overdue" /> : <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span><span className="font-medium">{formatDateGB(u.date)}</span> {u.label}{u.overdue ? <span className="text-destructive"> (overdue)</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recent activity">
        {activity.error ? <p className="text-sm text-destructive">{friendlyError(activity.error)}</p> : null}
        {(activity.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : (
          <ul className="space-y-2 text-sm">
            {activity.data!.map((a, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{formatTimestamp(a.occurred_at, timezone)}</span>{" "}
                {describeActivity(a.record_table, a.action)}{a.summary ? `: ${a.summary}` : ""}
                {a.actor_email ? <span className="text-muted-foreground"> · {a.actor_email}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const TABLE_LABEL: Record<string, string> = {
  projects: "Project", project_team: "Team member", project_organisations: "Organisation", project_key_dates: "Key date",
  project_modules: "Module", project_folders: "Folder", project_records: "Record", record_links: "Link", record_comments: "Comment",
};
function describeActivity(table: string, action: string) {
  const verb = action === "insert" ? "added" : action === "delete" ? "removed" : "changed";
  return `${TABLE_LABEL[table] ?? "Record"} ${verb}`;
}

/* ---------------- Details ---------------- */
export function ProjectDetailsCard({ tenantId, projectId, canManage }: Props) {
  const q = useQuery(projectDetailQuery(tenantId, projectId));
  const invalidate = useInvalidate(tenantId, projectId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const p = q.data?.project;
  const save = useMutation({
    mutationFn: async (patch: { description: string; site_address: string; contract_form: string; contract_reference: string; contract_notes: string }) => {
      const { data, error } = await supabase.from("projects").update(patch).eq("id", projectId).eq("version", p!.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Project details saved."); setEditing(false); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => { void invalidate(); void qc.invalidateQueries({ queryKey: ["tenant", tenantId, "projects"] }); },
  });
  if (!p) return null;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    save.mutate({ description: get("description"), site_address: get("site_address"), contract_form: get("contract_form"), contract_reference: get("contract_reference"), contract_notes: get("contract_notes") });
  };
  return (
    <Card title="Description, address and contract" action={canManage && !editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}>
      {editing ? (
        <form onSubmit={submit} className="grid gap-3">
          <div><Label htmlFor="pd-desc">Description</Label><Textarea id="pd-desc" name="description" defaultValue={p.description} maxLength={5000} /></div>
          <div><Label htmlFor="pd-addr">Site address</Label><Textarea id="pd-addr" name="site_address" defaultValue={p.site_address} rows={2} maxLength={500} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="pd-cf">Form of contract</Label><Input id="pd-cf" name="contract_form" defaultValue={p.contract_form} placeholder="e.g. NEC4 ECC Option A" maxLength={200} /></div>
            <div><Label htmlFor="pd-cr">Contract reference</Label><Input id="pd-cr" name="contract_reference" defaultValue={p.contract_reference} maxLength={200} /></div>
          </div>
          <div><Label htmlFor="pd-cn">Contract notes</Label><Textarea id="pd-cn" name="contract_notes" defaultValue={p.contract_notes} rows={2} maxLength={2000} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>Save</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Description</dt><dd className="mt-1 whitespace-pre-wrap">{p.description || "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Site address</dt><dd className="mt-1 whitespace-pre-wrap">{p.site_address || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Form of contract</dt><dd className="mt-1">{p.contract_form || "Not applicable / not set"}</dd></div>
          <div><dt className="text-muted-foreground">Contract reference</dt><dd className="mt-1">{p.contract_reference || "—"}</dd></div>
          {p.contract_notes ? <div className="sm:col-span-2"><dt className="text-muted-foreground">Contract notes</dt><dd className="mt-1 whitespace-pre-wrap">{p.contract_notes}</dd></div> : null}
        </dl>
      )}
    </Card>
  );
}

/* ---------------- Organisations ---------------- */
export function OrganisationsCard({ tenantId, projectId, canManage }: Props) {
  const q = useQuery(projectOrgsQuery(tenantId, projectId));
  const invalidate = useInvalidate(tenantId, projectId);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<OrgRole>("contractor");
  const add = useMutation({
    mutationFn: async (v: { name: string; contact_name: string; contact_email: string; contact_phone: string }) => {
      const { error } = await supabase.from("project_organisations").insert({ tenant_id: tenantId, project_id: projectId, org_role: role, name: v.name, contact_name: v.contact_name || null, contact_email: v.contact_email || null, contact_phone: v.contact_phone || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Organisation added."); setAdding(false); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("project_organisations").delete().eq("id", id); if (error) throw error; },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  return (
    <Card title="Organisations" action={canManage && !adding ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add</Button> : null}>
      {adding ? (
        <form className="mb-4 grid gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? "").trim(); add.mutate({ name: g("name"), contact_name: g("contact_name"), contact_email: g("contact_email"), contact_phone: g("contact_phone") }); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label htmlFor="org-name">Name</Label><Input id="org-name" name="name" required maxLength={200} /></div>
            <div><Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}><SelectTrigger aria-label="Organisation role"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(ORG_ROLE_LABEL) as OrgRole[]).map((r) => <SelectItem key={r} value={r}>{ORG_ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="org-cn">Contact name</Label><Input id="org-cn" name="contact_name" maxLength={200} /></div>
            <div><Label htmlFor="org-ce">Contact email</Label><Input id="org-ce" name="contact_email" type="email" maxLength={254} /></div>
            <div><Label htmlFor="org-cp">Contact phone</Label><Input id="org-cp" name="contact_phone" maxLength={40} /></div>
          </div>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={add.isPending}>Add organisation</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </form>
      ) : null}
      {(q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No organisations recorded. The project's client is shown above.</p> : (
        <ul className="divide-y text-sm">
          {q.data!.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-2 py-2">
              <div><span className="font-medium">{o.name}</span> <span className="text-muted-foreground">· {ORG_ROLE_LABEL[o.org_role as OrgRole] ?? o.org_role}</span>
                {o.contact_name || o.contact_email || o.contact_phone ? <div className="text-xs text-muted-foreground">{[o.contact_name, o.contact_email, o.contact_phone].filter(Boolean).join(" · ")}</div> : null}</div>
              {canManage ? <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => window.confirm(`Remove ${o.name} from this project?`) && remove.mutate(o.id)}>Remove</Button> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Team ---------------- */
export function TeamCard({ tenantId, projectId, canManage, isManager }: Props) {
  const q = useQuery(projectTeamQuery(tenantId, projectId));
  const people = useQuery({ ...employeesQuery(tenantId), enabled: canManage && isManager });
  const invalidate = useInvalidate(tenantId, projectId);
  const [emp, setEmp] = useState<string>("");
  const [role, setRole] = useState<ProjectRole>("member");
  const onTeam = new Set((q.data ?? []).map((t) => t.employee_id));
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("project_team").insert({ tenant_id: tenantId, project_id: projectId, employee_id: emp, project_role: role }); if (error) throw error; },
    onSuccess: () => { toast.success("Added to the project team."); setEmp(""); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const change = useMutation({
    mutationFn: async (v: { id: string; version: number; project_role: ProjectRole }) => {
      const { data, error } = await supabase.from("project_team").update({ project_role: v.project_role }).eq("id", v.id).eq("version", v.version).select("id");
      if (error) throw error; if (!data?.length) throw new StaleRecordError();
    },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("project_team").delete().eq("id", id); if (error) throw error; },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const candidates = (people.data ?? []).filter((p) => p.active && !onTeam.has(p.id));
  return (
    <Card title="Project team">
      <p className="mb-3 text-xs text-muted-foreground">Project admins can change this project's details, team and modules. Team members can add records. Viewers can only look. Owner/Admins and Resource Managers can always manage every project.</p>
      {(q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No one on the team yet.</p> : (
        <ul className="divide-y text-sm">
          {q.data!.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-medium">{t.employees?.full_name ?? "Unknown"}</span> <span className="text-muted-foreground">· {t.employees?.job_title}</span></span>
              {canManage ? (
                <span className="flex items-center gap-2">
                  <Select value={t.project_role} onValueChange={(v) => change.mutate({ id: t.id, version: t.version, project_role: v as ProjectRole })}>
                    <SelectTrigger aria-label={`Project role for ${t.employees?.full_name}`} className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((r) => <SelectItem key={r} value={r}>{PROJECT_ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove ${t.employees?.full_name} from the team?`) && remove.mutate(t.id)}>Remove</Button>
                </span>
              ) : <span className="text-muted-foreground">{PROJECT_ROLE_LABEL[t.project_role as ProjectRole]}</span>}
            </li>
          ))}
        </ul>
      )}
      {canManage && isManager ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select value={emp} onValueChange={setEmp}><SelectTrigger aria-label="Person to add" className="w-56"><SelectValue placeholder="Choose a person" /></SelectTrigger>
            <SelectContent>{candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
          <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}><SelectTrigger aria-label="Role" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(PROJECT_ROLE_LABEL) as ProjectRole[]).map((r) => <SelectItem key={r} value={r}>{PROJECT_ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" disabled={!emp || add.isPending} onClick={() => add.mutate()}>Add to team</Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------- Key dates ---------------- */
export function KeyDatesCard({ tenantId, projectId, canManage }: Props) {
  const q = useQuery(projectKeyDatesQuery(tenantId, projectId));
  const invalidate = useInvalidate(tenantId, projectId);
  const add = useMutation({
    mutationFn: async (v: { label: string; due_on: string }) => { const { error } = await supabase.from("project_key_dates").insert({ tenant_id: tenantId, project_id: projectId, ...v }); if (error) throw error; },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; version: number; achieved_on: string | null }) => {
      const { data, error } = await supabase.from("project_key_dates").update({ achieved_on: v.achieved_on }).eq("id", v.id).eq("version", v.version).select("id");
      if (error) throw error; if (!data?.length) throw new StaleRecordError();
    },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("project_key_dates").delete().eq("id", id); if (error) throw error; },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  return (
    <Card title="Key dates">
      {(q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No key dates yet.</p> : (
        <ul className="divide-y text-sm">
          {q.data!.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{k.achieved_on ? <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-label="Achieved" /> : null}<span className="font-medium">{formatDateGB(k.due_on)}</span> {k.label}{k.achieved_on ? <span className="text-muted-foreground"> · achieved {formatDateGB(k.achieved_on)}</span> : null}</span>
              {canManage ? (
                <span className="flex items-center gap-1">
                  <Input type="date" aria-label={`Achieved date for ${k.label}`} className="h-8 w-40" defaultValue={k.achieved_on ?? ""} onBlur={(e) => { const v = e.target.value || null; if (v !== k.achieved_on) update.mutate({ id: k.id, version: k.version, achieved_on: v }); }} />
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove key date "${k.label}"?`) && remove.mutate(k.id)}>Remove</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const label = String(f.get("label") ?? "").trim(); const due_on = String(f.get("due_on") ?? ""); if (label && due_on) { add.mutate({ label, due_on }); e.currentTarget.reset(); } }}>
          <div><Label htmlFor="kd-label">Milestone</Label><Input id="kd-label" name="label" required maxLength={200} className="w-56" /></div>
          <div><Label htmlFor="kd-date">Date</Label><Input id="kd-date" name="due_on" type="date" required className="w-40" /></div>
          <Button type="submit" size="sm" disabled={add.isPending}>Add date</Button>
        </form>
      ) : null}
    </Card>
  );
}

/* ---------------- Modules, template and folders ---------------- */
export function ProjectModulesCard({ tenantId, projectId, businessModules, canManage, isManager }: Props) {
  const q = useQuery(projectModulesQuery(tenantId, projectId));
  const detail = useQuery(projectDetailQuery(tenantId, projectId));
  const folders = useQuery(projectFoldersQuery(tenantId, projectId));
  const templates = useQuery({ ...projectTemplatesQuery(tenantId), enabled: canManage && isManager });
  const invalidate = useInvalidate(tenantId, projectId);
  const [tpl, setTpl] = useState("");
  const on = q.data ?? new Set<string>();
  const toggle = useMutation({
    mutationFn: async (v: { module_id: string; enabled: boolean }) => {
      const { error } = await supabase.from("project_modules").upsert({ tenant_id: tenantId, project_id: projectId, ...v }, { onConflict: "project_id,module_id" });
      if (error) throw error;
    },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const apply = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.rpc("apply_project_template", { _project: projectId, _template: templateId });
      if (error) throw error;
      return (data as string[] | null) ?? [];
    },
    onSuccess: (skipped) => {
      toast.success(skipped.length ? `Template applied. Skipped (not on for this business): ${skipped.map((m) => MODULES[m as ModuleId]?.name ?? m).join(", ")}.` : "Template applied.");
      setTpl("");
    },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => void invalidate(),
  });
  const chosenTemplate = templates.data?.find((t) => t.id === tpl);
  const preview = chosenTemplate ? templatePreview(chosenTemplate.module_ids, businessModules) : null;
  const appliedName = templates.data?.find((t) => t.id === detail.data?.project?.template_id)?.name;

  return (
    <Card title="Project modules">
      <p className="mb-3 text-xs text-muted-foreground">Only modules your business has switched on can be chosen. Switching one off hides it and stops new entries; nothing is deleted.</p>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {PROJECT_MODULE_IDS.map((id) => {
          const state = projectModuleState(id, businessModules, on);
          if (state === "off_for_business" && !on.has(id)) return null;
          const sid = `pm-${id}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 border-b py-2 text-sm">
              <div>
                <label htmlFor={sid} className="font-medium">{MODULES[id].name}</label>
                {state === "off_for_business" ? <p className="text-xs text-warning">Switched off for the business. Records are kept.</p> : !MODULES[id].built ? <p className="text-xs text-muted-foreground">Pages coming in a later stage.</p> : null}
              </div>
              <Switch id={sid} checked={state === "active"} disabled={!canManage || state === "off_for_business" || toggle.isPending}
                onCheckedChange={(v) => { if (v || window.confirm(`Switch off ${MODULES[id].name} for this project? Its records are kept and reappear when switched back on.`)) toggle.mutate({ module_id: id, enabled: v }); }} />
            </li>
          );
        })}
      </ul>
      {[...businessModules].filter((m) => MODULES[m].kind === "project").length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No project modules are switched on for this business yet. Ask your platform administrator.</p> : null}

      <div className="mt-4 border-t pt-4">
        <h3 className="text-sm font-semibold">Template and folders</h3>
        <p className="text-xs text-muted-foreground">{appliedName ? `Set up from template "${appliedName}". ` : ""}Folders are ready for Documents and Photos when those are built.</p>
        {canManage && isManager && (templates.data ?? []).some((t) => t.active) ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Select value={tpl} onValueChange={setTpl}><SelectTrigger aria-label="Template" className="w-56"><SelectValue placeholder="Apply a template" /></SelectTrigger>
              <SelectContent>{templates.data!.filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" disabled={!tpl || apply.isPending} onClick={() => apply.mutate(tpl)}>Apply</Button>
          </div>
        ) : null}
        {preview ? <p className="mt-2 text-xs text-muted-foreground">Adds modules: {preview.apply.map((m) => MODULES[m as ModuleId].name).join(", ") || "none"}. {preview.skipped.length ? `Skips (not on for this business): ${preview.skipped.map((m) => MODULES[m as ModuleId]?.name ?? m).join(", ")}. ` : ""}Adds {chosenTemplate!.folder_paths.length} folder path(s); existing folders and modules are kept.</p> : null}
        {(folders.data ?? []).length ? (
          <ul className="mt-2 columns-1 text-sm sm:columns-2">{folderPaths(folders.data!).map((f) => <li key={f} className="text-muted-foreground">{f}</li>)}</ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">No folders yet.</p>}
      </div>
    </Card>
  );
}
