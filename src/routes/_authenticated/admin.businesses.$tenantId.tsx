import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { AdminFrame } from "@/components/admin/admin-frame";
import { NotPlatformAdmin } from "@/components/admin/not-platform-admin";
import { ModulesSection } from "@/components/admin/modules-section";
import { SetupBadge } from "@/components/admin/setup-badge";
import { CenteredPanel } from "@/components/app/centered-panel";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/db-errors";
import { formatDateGB, todayIn } from "@/lib/domain/dates";
import { MODULES, isModuleId } from "@/lib/domain/modules";
import { setupSteps } from "@/lib/domain/tenant-setup";
import { inviteMember } from "@/lib/members.functions";
import { platformTenantsQuery, setBusinessStatus, tenantOwnersQuery } from "@/lib/platform";
import { isPlatformAdminQuery } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin/businesses/$tenantId")({
  loader: async ({ context, params }) => {
    const admin = await context.queryClient.ensureQueryData(isPlatformAdminQuery(context.user.id));
    if (admin)
      await Promise.all([
        context.queryClient.ensureQueryData(platformTenantsQuery()),
        context.queryClient.ensureQueryData(tenantOwnersQuery(params.tenantId)),
      ]);
  },
  head: () => ({
    meta: [
      { title: "Business setup — Platform administration — Emerald Rock OS" },
      { name: "description", content: "Setup status, Owner/Admin invitations and status for one business." },
      { property: "og:title", content: "Business setup — Platform administration" },
      { property: "og:description", content: "Setup status, Owner/Admin invitations and status for one business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: () => <CenteredPanel title="Loading business…" />,
  component: BusinessPage,
});

function BusinessPage() {
  const { user } = Route.useRouteContext();
  const { data: isAdmin } = useSuspenseQuery(isPlatformAdminQuery(user.id));
  if (!isAdmin) return <NotPlatformAdmin />;
  return <BusinessDetail email={user.email} />;
}

const londonDate = (iso: string) => formatDateGB(todayIn("Europe/London", new Date(iso)));

function BusinessDetail({ email }: { email: string }) {
  const { tenantId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: tenants } = useSuspenseQuery(platformTenantsQuery());
  const { data: owners } = useSuspenseQuery(tenantOwnersQuery(tenantId));
  const tenant = tenants.find((t) => t.id === tenantId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!tenant)
    return (
      <AdminFrame email={email}>
        <p className="text-muted-foreground">That business doesn't exist.</p>
        <Link to="/admin" className="mt-4 inline-block text-primary underline">Back to businesses</Link>
      </AdminFrame>
    );

  const suspending = tenant.status === "active";
  async function changeStatus() {
    if (!tenant) return;
    setBusy(true);
    try {
      await setBusinessStatus(tenant.id, tenant.version, suspending ? "suspended" : "active");
      toast.success(suspending ? "Business suspended." : "Business reactivated.");
      setConfirming(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
    }
  }

  return (
    <AdminFrame email={email}>
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All businesses
      </Link>
      <PageHeader
        title={tenant.displayName}
        description={`${tenant.businessName} · Prefix ${tenant.projectPrefix} · Created ${londonDate(tenant.createdAt)}${tenant.isDemo ? " · Demo" : ""}`}
        actions={
          <Button variant={suspending ? "destructive" : "default"} onClick={() => setConfirming(true)}>
            {suspending ? "Suspend business" : "Reactivate business"}
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-foreground">Setup</h2>
            <SetupBadge facts={tenant} />
          </div>
          <ol className="mt-4 space-y-2 text-sm">
            {setupSteps(tenant).map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                <span className="sr-only">{s.done ? "(done)" : "(not yet)"}</span>
              </li>
            ))}
          </ol>
          <h3 className="mt-5 text-sm font-medium text-foreground">Modules switched on</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.modulesEnabled.length
              ? tenant.modulesEnabled.map((m) => (isModuleId(m) ? MODULES[m].name : m)).join(", ")
              : "None yet."}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{tenant.membersActive} people have active access.</p>
        </section>
        <OwnersSection tenantId={tenant.id} owners={owners} />
        <ModulesSection tenantId={tenant.id} businessName={tenant.displayName} enabledIds={tenant.modulesEnabled} />
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suspending ? `Suspend ${tenant.displayName}?` : `Reactivate ${tenant.displayName}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {suspending
                ? "Nobody in this business will be able to open it until it's reactivated. No data is deleted."
                : "Everyone with active access will be able to open this business again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void changeStatus(); }}>
              {suspending ? "Suspend" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}

function OwnersSection({ tenantId, owners }: { tenantId: string; owners: { id: string; email: string; status: string; invitedAt: string; activatedAt: string | null }[] }) {
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteMember);
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await invite({ data: { tenantId, email: emailInput, role: "owner_admin" } });
      toast.success(r.emailSent ? "Invitation email sent." : "Existing login added as Owner/Admin.");
      setEmailInput("");
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="font-medium text-foreground">Owner/Admins</h2>
      <ul className="mt-3 divide-y divide-border text-sm">
        {owners.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="block text-foreground">{o.email}</span>
              <span className="block text-xs text-muted-foreground">
                Invited {londonDate(o.invitedAt)}{o.activatedAt ? ` · Signed in ${londonDate(o.activatedAt)}` : ""}
              </span>
            </span>
            <StatusBadge tone={o.status === "active" ? "ok" : o.status === "suspended" ? "paused" : "pending"}>
              {o.status === "active" ? "Active" : o.status === "suspended" ? "Suspended" : "Invited"}
            </StatusBadge>
          </li>
        ))}
        {owners.length === 0 ? <li className="py-2 text-muted-foreground">Nobody yet.</li> : null}
      </ul>
      <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
        <Label htmlFor="owner-email">Invite an Owner/Admin</Label>
        <div className="flex gap-2">
          <Input id="owner-email" type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="name@company.co.uk" />
          <Button type="submit" disabled={saving || !emailInput.trim()}>{saving ? "Sending…" : "Invite"}</Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">The Owner/Admin then invites everyone else from inside the business.</p>
      </form>
    </section>
  );
}
