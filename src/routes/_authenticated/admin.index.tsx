import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
import { AdminFrame } from "@/components/admin/admin-frame";
import { NotPlatformAdmin } from "@/components/admin/not-platform-admin";
import { SetupBadge } from "@/components/admin/setup-badge";
import { CenteredPanel } from "@/components/app/centered-panel";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/db-errors";
import { normaliseProjectPrefix } from "@/lib/domain/tenant-setup";
import { inviteMember } from "@/lib/members.functions";
import { createBusiness, platformTenantsQuery } from "@/lib/platform";
import { isPlatformAdminQuery } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ context }) => {
    const admin = await context.queryClient.ensureQueryData(isPlatformAdminQuery(context.user.id));
    if (admin) await context.queryClient.ensureQueryData(platformTenantsQuery());
  },
  head: () => ({
    meta: [
      { title: "Businesses — Platform administration — Emerald Rock OS" },
      { name: "description", content: "Create, suspend and track setup of businesses on Emerald Rock OS." },
      { property: "og:title", content: "Businesses — Platform administration" },
      { property: "og:description", content: "Create, suspend and track setup of businesses on Emerald Rock OS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: () => <CenteredPanel title="Loading businesses…" />,
  component: AdminHome,
});

function AdminHome() {
  const { user } = Route.useRouteContext();
  const { data: isAdmin } = useSuspenseQuery(isPlatformAdminQuery(user.id));
  if (!isAdmin) return <NotPlatformAdmin />;
  return <BusinessList email={user.email} />;
}

function BusinessList({ email }: { email: string }) {
  const { data: tenants } = useSuspenseQuery(platformTenantsQuery());
  const [open, setOpen] = useState(false);
  return (
    <AdminFrame email={email}>
      <PageHeader
        title="Businesses"
        description="Platform administrators see setup status only — never a business's people, projects or fees."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> New business
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Business</th>
              <th scope="col" className="px-4 py-2 font-medium">Prefix</th>
              <th scope="col" className="px-4 py-2 font-medium">Setup</th>
              <th scope="col" className="px-4 py-2 font-medium">Owner/Admins</th>
              <th scope="col" className="px-4 py-2 font-medium">Modules on</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <Link to="/admin/businesses/$tenantId" params={{ tenantId: t.id }} className="font-medium text-foreground hover:underline">
                    {t.displayName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {t.businessName}{t.isDemo ? " · Demo" : ""}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">{t.projectPrefix}</td>
                <td className="px-4 py-3"><SetupBadge facts={t} /></td>
                <td className="px-4 py-3">
                  {t.ownersActive} active{t.ownersInvited ? `, ${t.ownersInvited} invited` : ""}
                </td>
                <td className="px-4 py-3">{t.modulesEnabled.length}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/admin/businesses/$tenantId" params={{ tenantId: t.id }} aria-label={`Open ${t.displayName}`}>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
            {tenants.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No businesses yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <NewBusinessDialog open={open} onOpenChange={setOpen} />
    </AdminFrame>
  );
}

function NewBusinessDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invite = useServerFn(inviteMember);
  const [businessName, setBusinessName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const p = normaliseProjectPrefix(prefix);
    if (!businessName.trim() || !displayName.trim()) return setError("Enter the business name and the display name.");
    if (!p) return setError("Project prefix must start with a letter and be 2–6 capital letters or digits, e.g. HPD.");
    setSaving(true);
    try {
      const id = await createBusiness({ businessName: businessName.trim(), displayName: displayName.trim(), projectPrefix: p });
      let note = "Business created.";
      if (ownerEmail.trim()) {
        try {
          const r = await invite({ data: { tenantId: id, email: ownerEmail, role: "owner_admin" } });
          note = r.emailSent ? "Business created and invitation email sent." : "Business created; existing login added as Owner/Admin.";
        } catch (err) {
          note = `Business created, but the invitation failed: ${friendlyError(err)}`;
        }
      }
      toast.success(note);
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      onOpenChange(false);
      navigate({ to: "/admin/businesses/$tenantId", params: { tenantId: id } });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New business</DialogTitle>
            <DialogDescription>
              Starts with GBP, Europe/London, DD/MM/YYYY and a Monday-start week. All modules start switched off.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nb-business">Business name</Label>
              <Input id="nb-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-display">Display name</Label>
              <Input id="nb-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-prefix">Project reference prefix</Label>
              <Input id="nb-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={6} className="font-mono" />
              <p className="text-xs text-muted-foreground">Projects will be numbered like {normaliseProjectPrefix(prefix) ?? "ABC"}-0001.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-owner">First Owner/Admin email (optional)</Label>
              <Input id="nb-owner" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create business"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
