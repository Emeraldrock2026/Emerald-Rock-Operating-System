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
    <div className="max-w-4xl">
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
