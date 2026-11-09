import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { clientsQuery, projectsQuery } from "@/lib/projects-data";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { ROLE_LABEL } from "@/lib/labels";
import { AlertTriangle } from "lucide-react";
import { overviewCards } from "@/lib/domain/exports";
import { formatDateGB, todayIn, weekDates } from "@/lib/domain/dates";
import { capacityOn, dayFigures, roundHours, sumDays } from "@/lib/domain/capacity";
import { formatGBP } from "@/lib/domain/commercial";
import { employeesQuery, patternsQuery } from "@/lib/people";

const modulesCatalogueQuery = queryOptions({
  queryKey: ["modules-catalogue"],
  staleTime: 60 * 60 * 1000,
  queryFn: async () => {
    const { data, error } = await supabase.from("modules").select("id, name, description, depends_on").order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
});

export const Route = createFileRoute("/_authenticated/t/$tenantId/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(modulesCatalogueQuery),
  head: () => ({
    meta: [
      { title: "Overview — Emerald Rock OS" },
      { name: "description", content: "Your business at a glance in Emerald Rock OS." },
      { property: "og:title", content: "Overview — Emerald Rock OS" },
      { property: "og:description", content: "Your business at a glance in Emerald Rock OS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { ctx, user, tenantId } = useTenant();
  const { data: catalogue } = useSuspenseQuery(modulesCatalogueQuery);
  const tenant = ctx.tenant!;
  const membership = ctx.membership!;
  const isAdmin = ctx.access ? can(ctx.access, "tenant.users.manage") : false;
  const cards = overviewCards(ctx.access);

  return (
    <div className="max-w-5xl">
      <PageHeader title={tenant.displayName} description={tenant.businessName} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="account-heading">
          <h2 id="account-heading" className="text-sm font-semibold text-foreground">Your account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="truncate text-foreground">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="text-foreground">{ROLE_LABEL[membership.role]}</dd>
            </div>
            {membership.role === "resource_manager" ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fee and budget access</dt>
                <dd className="text-foreground">{membership.commercialAccess ? "Granted" : "Not granted"}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Business timezone</dt>
              <dd className="text-foreground">{tenant.timezone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="text-foreground">{tenant.baseCurrency}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="modules-heading">
          <h2 id="modules-heading" className="text-sm font-semibold text-foreground">Modules for this business</h2>
          <ul className="mt-3 space-y-3">
            {catalogue.map((m) => {
              const on = ctx.enabledModules.some((e) => e === m.id);
              return (
                <li key={m.id} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <StatusBadge tone={on ? "ok" : "off"}>{on ? "On" : "Off"}</StatusBadge>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">Modules are switched on and off by the platform administrator.</p>
        </section>
      </div>

      {cards.includes("clients_projects") ? <ClientsProjectsCard /> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {cards.includes("team_week") ? <WeekCard team /> : null}
        {cards.includes("my_week") ? <WeekCard team={false} /> : null}
        {cards.includes("commercial") ? <CommercialCard /> : null}
        {cards.includes("exports") ? (
          <Link to="/t/$tenantId/exports" params={{ tenantId }} className="rounded-lg border border-border bg-card p-5 shadow-card hover:border-primary">
            <h2 className="text-sm font-semibold text-foreground">Exports</h2>
            <p className="mt-2 text-sm text-muted-foreground">Download CSV files of the records you can see.</p>
          </Link>
        ) : null}
      </div>
      {isAdmin ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Invite colleagues and manage roles in{" "}
          <Link to="/t/$tenantId/settings/users" params={{ tenantId }} className="font-medium text-primary underline-offset-4 hover:underline">Settings → Users</Link>.
        </p>
      ) : null}
    </div>
  );
}

function useWeek() {
  const { ctx, tenantId } = useTenant();
  const days = weekDates(todayIn(ctx.tenant!.timezone));
  return { tenantId, days };
}

function WeekCard({ team }: { team: boolean }) {
  const { tenantId, days } = useWeek();
  const { user } = useTenant();
  const people = useQuery(employeesQuery(tenantId));
  const patterns = useQuery(patternsQuery(tenantId));
  const allocs = useQuery({
    queryKey: ["tenant", tenantId, "allocations", days[0], "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allocations").select("employee_id, allocation_date, hours")
        .eq("tenant_id", tenantId).gte("allocation_date", days[0]!).lte("allocation_date", days[6]!);
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, hours: Number(a.hours) }));
    },
  });
  const ready = people.data && patterns.data && allocs.data;
  const list = (people.data ?? []).filter((e) => (team ? e.active : e.user_id === user.id));
  const figs = list.flatMap((e) => days.map((d) => dayFigures(
    (allocs.data ?? []).filter((a) => a.employee_id === e.id && a.allocation_date === d).map((a) => a.hours),
    capacityOn(patterns.data?.get(e.id) ?? [], d))));
  const total = sumDays(figs);
  const overDays = figs.filter((f) => f.overAllocation > 0).length;
  return (
    <Link to="/t/$tenantId/planner" params={{ tenantId }} className="rounded-lg border border-border bg-card p-5 shadow-card hover:border-primary">
      <h2 className="text-sm font-semibold text-foreground">{team ? "Team this week" : "My week"}</h2>
      <p className="text-xs text-muted-foreground">{formatDateGB(days[0]!)} – {formatDateGB(days[6]!)}</p>
      {!ready ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : !team && list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">You aren't linked to an employee record yet.</p>
      ) : (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{total.allocated} / {total.capacity} h</p>
          <p className="text-xs text-muted-foreground">allocated / working hours{team ? ` across ${list.length} people` : ""}</p>
          <p className={overDays ? "mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive" : "mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"}>
            {overDays ? <AlertTriangle className="size-4" aria-hidden /> : null}
            {overDays ? `${overDays} over-capacity ${overDays === 1 ? "day" : "days"}` : "No over-capacity days"}
          </p>
        </>
      )}
    </Link>
  );
}

function CommercialCard() {
  const { tenantId } = useTenant();
  const projects = useQuery(projectsQuery(tenantId));
  const comm = useQuery({
    queryKey: ["tenant", tenantId, "commercials", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_commercials").select("project_id, agreed_fee, budget_hours").eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const live = (projects.data ?? []).filter((p) => p.status === "active" || p.status === "on_hold");
  const byProject = new Map((comm.data ?? []).map((c) => [c.project_id, c]));
  const fee = live.reduce((s, p) => s + Number(byProject.get(p.id)?.agreed_fee ?? 0), 0);
  const hours = live.reduce((s, p) => s + Number(byProject.get(p.id)?.budget_hours ?? 0), 0);
  const missing = live.filter((p) => byProject.get(p.id)?.agreed_fee == null).length;
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="comm-heading">
      <h2 id="comm-heading" className="text-sm font-semibold text-foreground">Fees on active and on-hold projects</h2>
      {!projects.data || !comm.data ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{formatGBP(fee)}</p>
          <p className="text-xs text-muted-foreground">{roundHours(hours)} budget hours across {live.length} projects</p>
          {missing ? <p className="mt-2 text-sm text-muted-foreground">{missing} without an agreed fee</p> : null}
        </>
      )}
    </section>
  );
}

function ClientsProjectsCard() {
  const { ctx, tenantId } = useTenant();
  const showProjects = ctx.access ? can(ctx.access, "projects.view_allocated") : false;
  const showClients = ctx.access ? can(ctx.access, "clients.view") : false;
  const projects = useQuery({ ...projectsQuery(tenantId), enabled: showProjects });
  const clients = useQuery({ ...clientsQuery(tenantId), enabled: showClients });
  if (!showProjects) return null;
  const activeProjects = projects.data?.filter((p) => p.status === "active").length;
  const activeClients = clients.data?.filter((c) => c.active).length;
  return (
    <section className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Clients and projects">
      <Link to="/t/$tenantId/projects" params={{ tenantId }} className="rounded-lg border border-border bg-card p-5 shadow-card hover:border-primary">
        <p className="text-sm text-muted-foreground">{showClients ? "Active projects" : "Your active projects"}</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{activeProjects ?? "…"}</p>
      </Link>
      {showClients ? (
        <Link to="/t/$tenantId/clients" params={{ tenantId }} className="rounded-lg border border-border bg-card p-5 shadow-card hover:border-primary">
          <p className="text-sm text-muted-foreground">Active clients</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{activeClients ?? "…"}</p>
        </Link>
      ) : null}
    </section>
  );
}
