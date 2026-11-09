import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { ROLE_LABEL } from "@/lib/labels";

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

  return (
    <div className="max-w-4xl">
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

      <section className="mt-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-sm font-semibold text-foreground">What you can do now</h2>
        {isAdmin ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Invite colleagues and manage their roles in{" "}
            <Link to="/t/$tenantId/settings/users" params={{ tenantId }} className="font-medium text-primary underline-offset-4 hover:underline">
              Settings → Users
            </Link>
            . People, clients, projects and the resource planner are being added in the next stages.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Your allocations will appear here once resource planning is set up for your business.
          </p>
        )}
      </section>
    </div>
  );
}
