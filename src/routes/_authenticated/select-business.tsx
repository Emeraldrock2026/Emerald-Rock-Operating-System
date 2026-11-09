import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { CenteredPanel } from "@/components/app/centered-panel";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/components/app/sign-out";
import { ROLE_LABEL } from "@/lib/labels";
import { isPlatformAdminQuery, isUsable, lastTenantKey, myMembershipsQuery } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/select-business")({
  validateSearch: (search: Record<string, unknown>): { choose?: string } => ({
    choose: search.choose === "1" || search.choose === 1 ? "1" : undefined,
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(myMembershipsQuery(context.user.id)),
      context.queryClient.ensureQueryData(isPlatformAdminQuery(context.user.id)),
    ]),
  head: () => ({
    meta: [
      { title: "Choose a business — Emerald Rock OS" },
      { name: "description", content: "Choose which business to work in." },
      { property: "og:title", content: "Choose a business — Emerald Rock OS" },
      { property: "og:description", content: "Choose which business to work in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: () => <CenteredPanel title="Loading your businesses…" />,
  component: SelectBusiness,
});

function SelectBusiness() {
  const { user } = Route.useRouteContext();
  const { choose } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: memberships } = useSuspenseQuery(myMembershipsQuery(user.id));
  const { data: platformAdmin } = useSuspenseQuery(isPlatformAdminQuery(user.id));
  const usable = memberships.filter(isUsable);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (choose === "1") {
      setResolved(true);
      return;
    }
    const last = window.localStorage.getItem(lastTenantKey(user.id));
    const target =
      usable.find((m) => m.tenantId === last) ?? (usable.length === 1 && !platformAdmin ? usable[0] : undefined);
    if (target) {
      navigate({ to: "/t/$tenantId", params: { tenantId: target.tenantId }, replace: true });
    } else {
      setResolved(true);
    }
  }, [choose, navigate, platformAdmin, usable, user.id]);

  if (!resolved) return <CenteredPanel title="Opening your business…" />;

  const unavailable = memberships.filter((m) => !isUsable(m) && m.status !== "removed" && m.status !== "invited");

  return (
    <CenteredPanel
      title={usable.length ? "Choose a business" : "No business access yet"}
      description={
        usable.length
          ? `Signed in as ${user.email}.`
          : `You're signed in as ${user.email}, but you don't have access to any business yet. Ask the business's Owner/Admin to invite you.`
      }
    >
      {usable.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {usable.map((m) => (
            <li key={m.id}>
              <Link
                to="/t/$tenantId"
                params={{ tenantId: m.tenantId }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent focus-visible:bg-accent"
              >
                <span>
                  <span className="block font-medium text-foreground">{m.tenant?.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.tenant?.businessName} · {ROLE_LABEL[m.role]}
                    {m.tenant?.isDemo ? " · Demo" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {unavailable.length ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-foreground">Unavailable</h2>
          <ul className="mt-2 space-y-2">
            {unavailable.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{m.tenant?.displayName ?? "A business"}</span>
                <StatusBadge tone="paused">{m.status === "suspended" ? "Your access is suspended" : "Business suspended"}</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {platformAdmin ? (
        <p className="mt-6 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          You're a platform administrator. The platform administration area is added in the next stage.
        </p>
      ) : null}

      <Button variant="outline" className="mt-6 w-full" onClick={() => signOut(queryClient, navigate)}>
        Sign out
      </Button>
    </CenteredPanel>
  );
}
