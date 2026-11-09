import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/app/app-shell";
import { CenteredPanel } from "@/components/app/centered-panel";
import { Button } from "@/components/ui/button";
import { lastTenantKey, tenantContextQuery } from "@/lib/session";
import { friendlyError } from "@/lib/db-errors";

export const Route = createFileRoute("/_authenticated/t/$tenantId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(tenantContextQuery(params.tenantId, context.user.id)),
  pendingComponent: () => <CenteredPanel title="Opening business…" />,
  errorComponent: ({ error }) => (
    <CenteredPanel title="This business didn't load" description={friendlyError(error)}>
      <Button asChild className="w-full">
        <Link to="/select-business" search={{ choose: "1" }}>Choose a business</Link>
      </Button>
    </CenteredPanel>
  ),
  component: TenantLayout,
});

function TenantLayout() {
  const { tenantId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data: ctx } = useSuspenseQuery(tenantContextQuery(tenantId, user.id));
  const usable = ctx.tenant?.status === "active" && ctx.membership?.status === "active";

  useEffect(() => {
    if (usable) window.localStorage.setItem(lastTenantKey(user.id), tenantId);
  }, [usable, tenantId, user.id]);

  if (!usable) {
    const reason = !ctx.membership || !ctx.tenant
      ? "You don't have access to this business, or it doesn't exist."
      : ctx.tenant.status !== "active"
        ? "This business has been suspended. Contact the platform administrator."
        : ctx.membership.status === "invited"
          ? "Your invitation hasn't been activated yet. Sign out and sign in again."
          : "Your access to this business has been suspended or removed. Contact its Owner/Admin.";
    return (
      <CenteredPanel title="No access" description={reason}>
        <Button asChild className="w-full">
          <Link to="/select-business" search={{ choose: "1" }}>Choose another business</Link>
        </Button>
      </CenteredPanel>
    );
  }

  return (
    <AppShell ctx={ctx} user={user}>
      <Outlet />
    </AppShell>
  );
}
