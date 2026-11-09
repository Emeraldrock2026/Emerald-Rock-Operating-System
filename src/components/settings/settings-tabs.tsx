import { Link } from "@tanstack/react-router";
import { can } from "@/lib/domain/permissions";
import { useTenant } from "@/lib/use-tenant";

/** Sub-navigation for Settings; each tab only appears to people allowed to use it. */
export function SettingsTabs() {
  const { ctx, tenantId } = useTenant();
  const admin = ctx.access ? can(ctx.access, "tenant.settings.manage") : false;
  const tabs = [
    ...(admin ? [{ to: "/t/$tenantId/settings/users" as const, label: "Users" }] : []),
    ...(admin ? [{ to: "/t/$tenantId/settings/branding" as const, label: "Business branding" }] : []),
    { to: "/t/$tenantId/settings/appearance" as const, label: "My appearance" },
  ];
  return (
    <nav aria-label="Settings" className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} params={{ tenantId }}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          activeProps={{ className: "border-primary font-medium text-foreground", "aria-current": "page" }}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
