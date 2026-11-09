import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { RequireModule } from "@/components/app/require-module";
import { ProjectForm, SubmitButton, type ProjectFormValues } from "@/components/projects/project-form";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { allowedStatusTransitions, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/domain/projects";
import { formatDateGB } from "@/lib/domain/dates";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { clientsQuery, projectsQuery } from "@/lib/projects-data";
import { employeesQuery } from "@/lib/people";
import { ProjectCommercials } from "@/components/commercial/project-commercials";
import { KeyDatesCard, OrganisationsCard, ProjectDashboard, ProjectDetailsCard, ProjectModulesCard, TeamCard } from "@/components/project-setup/project-workspace";
import { projectDetailQuery, projectModulesQuery } from "@/lib/project-setup-data";
import { ReportsPanel } from "@/components/reports/reports-panel";
import type { ReportModule } from "@/lib/domain/reports";
import { RegisterPanel } from "@/components/registers/register-panel";
import { REGISTER_MODULES, REGISTERS } from "@/lib/domain/registers";
import { ChangeRegister } from "@/components/drawings/change-register";
import { DrawingRegister } from "@/components/drawings/drawing-register";
import { ProjectFilesPanel } from "@/components/project-files/project-files-panel";
import { fileModuleAccess, type FileModuleId } from "@/lib/domain/project-files";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/t/$tenantId/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Emerald Rock OS" },
      { name: "description", content: "Project details, status and planned dates." },
      { property: "og:title", content: "Project — Emerald Rock OS" },
      { property: "og:description", content: "Project details, status and planned dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModule module="clients_projects">
      <ProjectPage />
    </RequireModule>
  ),
});

const STATUS_WARNING: Partial<Record<ProjectStatus, string>> = {
  completed: "Completed projects can't receive new work.",
  archived: "Archived projects are hidden from the open list and can't receive new work.",
  on_hold: "Booking new work on an On Hold project will need confirmation.",
  draft: "Draft projects can't receive work.",
};

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const manage = ctx.access ? can(ctx.access, "projects.manage") : false;
  const projects = useQuery(projectsQuery(tenantId));
  const clients = useQuery({ ...clientsQuery(tenantId), enabled: manage });
  const people = useQuery({ ...employeesQuery(tenantId), enabled: manage });
  const [editing, setEditing] = useState(false);
  const p = projects.data?.find((x) => x.id === projectId);
  const detail = useQuery({ ...projectDetailQuery(tenantId, projectId), enabled: !!p });
  const canManageProject = manage || detail.data?.myRole === "project_admin";
  const projectMods = useQuery(projectModulesQuery(tenantId, projectId));
  const canContribute = manage || detail.data?.myRole === "project_admin" || detail.data?.myRole === "member";
  const fileTabs = (["photos", "documents"] as FileModuleId[]).map((id) => ({
    id, label: id === "photos" ? "Photos" : "Documents",
    access: fileModuleAccess({
      businessOn: ctx.access?.enabledModules.has(id) ?? false, projectOn: projectMods.data?.has(id) ?? false,
      canView: true, canContribute, canManage: canManageProject,
    }),
  })).filter((t) => t.access.visible);
  const changeAccess = fileModuleAccess({
    businessOn: ctx.access?.enabledModules.has("change_control") ?? false, projectOn: projectMods.data?.has("change_control") ?? false,
    canView: true, canContribute: canManageProject, canManage: canManageProject,
  });
  const drawingsAccess = fileModuleAccess({
    businessOn: ctx.access?.enabledModules.has("drawings") ?? false, projectOn: projectMods.data?.has("drawings") ?? false,
    canView: true, canContribute, canManage: canManageProject,
  });

  const reportTabs = (["progress_reports", "delay_reports"] as ReportModule[]).map((id) => ({
    id, label: id === "progress_reports" ? "Progress reports" : "Delay reports",
    access: fileModuleAccess({
      businessOn: ctx.access?.enabledModules.has(id) ?? false, projectOn: projectMods.data?.has(id) ?? false,
      canView: true, canContribute, canManage: canManageProject,
    }),
  })).filter((t) => t.access.visible);
  const registerTabs = REGISTER_MODULES.map((id) => ({
    id, label: REGISTERS[id].label,
    access: fileModuleAccess({
      businessOn: ctx.access?.enabledModules.has(id) ?? false, projectOn: projectMods.data?.has(id) ?? false,
      canView: true, canContribute, canManage: canManageProject,
    }),
  })).filter((t) => t.access.visible);
  const photosOn = (ctx.access?.enabledModules.has("photos") ?? false) && (projectMods.data?.has("photos") ?? false);

  const save = useMutation({
    mutationFn: async (patch: Partial<ProjectFormValues> & { status?: ProjectStatus }) => {
      const { data, error } = await supabase.from("projects").update(patch).eq("id", projectId).eq("version", p!.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Project saved."); setEditing(false); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "projects"] }),
  });

  if (projects.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (projects.error) return <p className="text-sm text-destructive">{friendlyError(projects.error)}</p>;
  if (!p) {
    return (
      <PageHeader title="Project not found" description={<>This project doesn't exist in this business or you can't see it. <Link to="/t/$tenantId/projects" params={{ tenantId }} className="underline">Back to Projects</Link></>} />
    );
  }

  const pm = people.data?.find((e) => e.id === p.project_manager_id)?.full_name;
  const changeStatus = (to: ProjectStatus) => {
    const extra = STATUS_WARNING[to] ? ` ${STATUS_WARNING[to]}` : "";
    if (window.confirm(`Change ${p.reference} to ${PROJECT_STATUS_LABEL[to]}?${extra}`)) save.mutate({ status: to });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={`${p.reference} · ${p.name}`}
        description={<Link to="/t/$tenantId/projects" params={{ tenantId }} className="underline-offset-4 hover:underline">← All projects</Link>}
        actions={<ProjectStatusBadge status={p.status} />}
      />

      {manage ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Change status:</span>
          {allowedStatusTransitions(p.status).map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={save.isPending} onClick={() => changeStatus(s)}>{PROJECT_STATUS_LABEL[s]}</Button>
          ))}
          {!editing ? <Button size="sm" className="ml-auto" onClick={() => setEditing(true)}>Edit details</Button> : null}
        </div>
      ) : null}

      {editing ? (
        <section className="rounded-lg border bg-card p-5">
          <ProjectForm
            id="edit-project"
            initial={{ name: p.name, client_id: p.client_id, project_manager_id: p.project_manager_id, start_date: p.start_date, planned_finish_date: p.planned_finish_date, scope: p.scope }}
            clients={clients.data ?? []}
            managers={people.data ?? []}
            onSubmit={(v) => save.mutate(v)}
          />
          <div className="mt-4 flex gap-2">
            <SubmitButton form="edit-project" pending={save.isPending} label="Save project" />
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </section>
      ) : (
        <dl className="grid gap-x-8 gap-y-4 rounded-lg border bg-card p-5 text-sm sm:grid-cols-2">
          <Item label="Reference" value={<span className="font-mono">{p.reference}</span>} />
          <Item label="Client" value={p.client_name ?? "No client (internal)"} />
          <Item label="Start date" value={formatDateGB(p.start_date)} />
          <Item label="Planned finish date" value={formatDateGB(p.planned_finish_date)} />
          {manage ? <Item label="Project manager" value={pm ?? "Not set"} /> : null}
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="mt-1 whitespace-pre-wrap text-foreground">{p.scope || "—"}</dd>
          </div>
        </dl>
      )}

      <Tabs defaultValue="dashboard" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          {fileTabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          {drawingsAccess.visible ? <TabsTrigger value="drawings">Drawings</TabsTrigger> : null}
          {reportTabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          {registerTabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          {changeAccess.visible ? <TabsTrigger value="changes">Change register</TabsTrigger> : null}
          <TabsTrigger value="setup">Team and setup</TabsTrigger>
        </TabsList>
        {(() => {
          const props = { tenantId, projectId, timezone: ctx.tenant!.timezone, businessModules: ctx.access?.enabledModules ?? new Set(), canManage: canManageProject, isManager: manage };
          return (
            <>
              <TabsContent value="dashboard" className="mt-4 space-y-4">
                <ProjectDashboard {...props} />
                <ProjectDetailsCard {...props} />
              </TabsContent>
              {fileTabs.map((t) => (
                <TabsContent key={t.id} value={t.id} className="mt-4">
                  <ProjectFilesPanel tenantId={tenantId} projectId={projectId} module={t.id} canUpload={t.access.canUpload} historicOnly={t.access.historicOnly} timezone={ctx.tenant!.timezone} />
                </TabsContent>
              ))}
              {drawingsAccess.visible ? (
                <TabsContent value="drawings" className="mt-4">
                  <DrawingRegister tenantId={tenantId} projectId={projectId} timezone={ctx.tenant!.timezone} canContribute={drawingsAccess.canUpload} canManage={canManageProject} historicOnly={drawingsAccess.historicOnly} changeModuleOn={changeAccess.visible && !changeAccess.historicOnly} />
                </TabsContent>
              ) : null}
              {reportTabs.map((t) => (
                <TabsContent key={t.id} value={t.id} className="mt-4">
                  <ReportsPanel tenantId={tenantId} projectId={projectId} module={t.id} timezone={ctx.tenant!.timezone}
                    project={{ reference: p.reference, name: p.name }}
                    brand={{ businessName: ctx.tenant!.displayName, colour: ctx.tenant!.brandColour, logoPath: ctx.tenant!.logoPath }}
                    canContribute={t.access.canUpload} canIssue={canManageProject} historicOnly={t.access.historicOnly} photosAvailable={photosOn} />
                </TabsContent>
              ))}
              {registerTabs.map((t) => (
                <TabsContent key={t.id} value={t.id} className="mt-4">
                  <RegisterPanel tenantId={tenantId} projectId={projectId} module={t.id} timezone={ctx.tenant!.timezone} canContribute={t.access.canUpload} canManage={canManageProject} historicOnly={t.access.historicOnly} />
                </TabsContent>
              ))}
              {changeAccess.visible ? (
                <TabsContent value="changes" className="mt-4">
                  <ChangeRegister tenantId={tenantId} projectId={projectId} timezone={ctx.tenant!.timezone} canEdit={canManageProject} historicOnly={changeAccess.historicOnly} />
                </TabsContent>
              ) : null}
              <TabsContent value="setup" className="mt-4 grid gap-4 lg:grid-cols-2">
                <TeamCard {...props} />
                <OrganisationsCard {...props} />
                <KeyDatesCard {...props} />
                <div className="lg:col-span-2"><ProjectModulesCard {...props} /></div>
              </TabsContent>
            </>
          );
        })()}
      </Tabs>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {ctx.access && can(ctx.access, "commercial.view") ? (
          <ProjectCommercials tenantId={tenantId} projectId={projectId} canEdit={can(ctx.access, "commercial.edit")} />
        ) : null}
        {ctx.access && can(ctx.access, "allocations.view_all") ? (
          <Placeholder title="Planned work" text="Book and change work for this project in the Planner." />
        ) : null}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-dashed p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </section>
  );
}
