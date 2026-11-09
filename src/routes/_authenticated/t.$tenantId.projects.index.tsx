import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { RequireModule } from "@/components/app/require-module";
import { ProjectForm, SubmitButton, type ProjectFormValues } from "@/components/projects/project-form";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { filterProjects, PROJECT_STATUS_LABEL, type ProjectFilter, type ProjectStatus } from "@/lib/domain/projects";
import { addDays, formatDateGB, todayIn } from "@/lib/domain/dates";
import { friendlyError } from "@/lib/db-errors";
import { clientsQuery, projectsQuery } from "@/lib/projects-data";
import { employeesQuery } from "@/lib/people";

export const Route = createFileRoute("/_authenticated/t/$tenantId/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Emerald Rock OS" },
      { name: "description", content: "Projects, their clients, status and planned dates." },
      { property: "og:title", content: "Projects — Emerald Rock OS" },
      { property: "og:description", content: "Projects, their clients, status and planned dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModule module="clients_projects">
      <ProjectsPage />
    </RequireModule>
  ),
});

const ALL = "__all__";

function ProjectsPage() {
  const { ctx, tenantId } = useTenant();
  const viewAll = ctx.access ? can(ctx.access, "projects.view_all") : false;
  const manage = ctx.access ? can(ctx.access, "projects.manage") : false;
  const projects = useQuery(projectsQuery(tenantId));
  const clients = useQuery({ ...clientsQuery(tenantId), enabled: viewAll });
  const [filter, setFilter] = useState<ProjectFilter>({ status: "open" });
  const [creating, setCreating] = useState(false);
  const rows = filterProjects(projects.data ?? [], filter);

  return (
    <>
      <PageHeader
        title="Projects"
        description={viewAll ? "Every project in this business. References are given automatically and never reused." : "Projects you're allocated to."}
        actions={manage ? <Button onClick={() => setCreating(true)}>New project</Button> : null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Search projects" placeholder="Search reference or name" className="max-w-xs" value={filter.search ?? ""} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
        <Select value={filter.status ?? "open"} onValueChange={(v) => setFilter((f) => ({ ...f, status: v as ProjectFilter["status"] }))}>
          <SelectTrigger aria-label="Status" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open (not closed)</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {viewAll ? (
          <Select value={filter.clientId ?? ALL} onValueChange={(v) => setFilter((f) => ({ ...f, clientId: v === ALL ? undefined : v }))}>
            <SelectTrigger aria-label="Client" className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {projects.error ? <p className="text-sm text-destructive">{friendlyError(projects.error)}</p> : null}
      {projects.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {projects.data && rows.length === 0 ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No projects to show.</p> : null}
      {rows.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="hidden sm:table-cell">Dates</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.reference}</TableCell>
                  <TableCell>
                    <Link to="/t/$tenantId/projects/$projectId" params={{ tenantId, projectId: p.id }} className="font-medium text-primary underline-offset-4 hover:underline">{p.name}</Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.client_name ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell whitespace-nowrap text-sm">{formatDateGB(p.start_date)} – {formatDateGB(p.planned_finish_date)}</TableCell>
                  <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {manage ? <NewProject open={creating} onOpenChange={setCreating} /> : null}
    </>
  );
}

function NewProject({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clients = useQuery(clientsQuery(tenantId));
  const people = useQuery(employeesQuery(tenantId));
  const today = todayIn(ctx.tenant!.timezone);
  const create = useMutation({
    mutationFn: async (v: ProjectFormValues) => {
      // reference is filled in by the database
      const { data, error } = await supabase.from("projects").insert({ tenant_id: tenantId, reference: "", ...v }).select("id, reference").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Project ${d.reference} created as Draft.`);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["tenant", tenantId, "projects"] });
      void navigate({ to: "/t/$tenantId/projects/$projectId", params: { tenantId, projectId: d.id } });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <ProjectForm
          id="new-project"
          initial={{ name: "", client_id: null, project_manager_id: null, start_date: today, planned_finish_date: addDays(today, 90), scope: "" }}
          clients={clients.data ?? []}
          managers={people.data ?? []}
          onSubmit={(v) => create.mutate(v)}
        />
        <DialogFooter><SubmitButton form="new-project" pending={create.isPending} label="Create project" /></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
