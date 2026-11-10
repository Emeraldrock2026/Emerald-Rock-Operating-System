import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, LayoutDashboard, LogOut, Users, Briefcase, FolderKanban, Menu, CircleUser, Settings, CalendarDays, Sun, Moon, Monitor, Download } from "lucide-react";
import { availableExports } from "@/lib/domain/exports";
import { BrandMark } from "./brand-mark";
import { signOut } from "./sign-out";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { can } from "@/lib/domain/permissions";
import type { Appearance } from "@/lib/domain/brand";
import { accentIsDark, brandStyle, logoUrlQuery } from "@/lib/branding";
import { getPersonalAppearance, savePersonalAppearance, setBusinessAppearance, subscribeAppearance } from "@/lib/appearance";
import { friendlyError } from "@/lib/db-errors";
import { ENVIRONMENT_LABEL, ROLE_LABEL } from "@/lib/labels";
import { forgetOtherTenants, isUsable, myMembershipsQuery, type TenantContext } from "@/lib/session";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: "/t/$tenantId" | "/t/$tenantId/people" | "/t/$tenantId/clients" | "/t/$tenantId/projects" | "/t/$tenantId/settings/users" | "/t/$tenantId/planner" | "/t/$tenantId/settings/appearance" | "/t/$tenantId/exports";
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

/** Only areas that exist, are enabled and are permitted appear here. */
function navItems(ctx: TenantContext): NavItem[] {
  const items: NavItem[] = [{ label: "Overview", to: "/t/$tenantId", icon: LayoutDashboard, exact: true }];
  if (ctx.access && ctx.access.status === "active" && ctx.access.tenantActive) {
    const all = can(ctx.access, "employees.view_all");
    items.push({ label: all ? "People" : "My hours", to: "/t/$tenantId/people", icon: Users });
  }
  if (ctx.access && can(ctx.access, "projects.view_allocated")) {
    items.push({ label: "Projects", to: "/t/$tenantId/projects", icon: FolderKanban });
  }
  if (ctx.access && can(ctx.access, "allocations.view_own")) {
    items.push({ label: can(ctx.access, "allocations.view_all") ? "Planner" : "My work", to: "/t/$tenantId/planner", icon: CalendarDays });
  }
  if (ctx.access && can(ctx.access, "clients.view")) {
    items.push({ label: "Clients", to: "/t/$tenantId/clients", icon: Briefcase });
  }
  if (availableExports(ctx.access).length) {
    items.push({ label: "Exports", to: "/t/$tenantId/exports", icon: Download });
  }
  if (ctx.access && can(ctx.access, "tenant.users.manage")) {
    items.push({ label: "Settings", to: "/t/$tenantId/settings/users", icon: Settings });
  } else if (ctx.access && ctx.access.status === "active") {
    items.push({ label: "Settings", to: "/t/$tenantId/settings/appearance", icon: Settings });
  }
  return items;
}

export function AppShell({ ctx, user, children }: { ctx: TenantContext; user: { id: string; email: string }; children: ReactNode }) {
  const tenant = ctx.tenant!;
  // Branding goes on <html> before paint so dialogs and menus (rendered outside this tree) match,
  // and is removed when leaving the business so the next one never shows the previous colours.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vars = brandStyle(tenant.brandColour, tenant.accentColour) as Record<string, string>;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.classList.add("brand-scope");
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
      root.classList.remove("brand-scope");
    };
  }, [tenant.id, tenant.brandColour, tenant.accentColour]);
  useLayoutEffect(() => {
    setBusinessAppearance(tenant.defaultAppearance);
  }, [tenant.id, tenant.defaultAppearance]);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
      {navItems(ctx).map((item) => (
        <Link
          key={item.to}
          to={item.to}
          params={{ tenantId: tenant.id }}
          activeOptions={{ exact: item.exact ?? false }}
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium", "aria-current": "page" }}
        >
          <item.icon className="size-4" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col bg-sidebar py-4">
      <div className="px-5 pb-4">
        <TenantLogo tenant={tenant} />
      </div>
      {nav}
      <div className="mt-auto px-5 pt-4 font-mono text-[11px] text-sidebar-foreground/70">{ENVIRONMENT_LABEL}</div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-sidebar-border md:block">{sidebarBody}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {sidebarBody}
            </SheetContent>
          </Sheet>
          <TenantSwitcher ctx={ctx} userId={user.id} />
          {tenant.isDemo ? (
            <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">Demo business</span>
          ) : null}
          <div className="ml-auto min-w-0">
            <UserMenu ctx={ctx} email={user.email} userId={user.id} />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function TenantSwitcher({ ctx, userId }: { ctx: TenantContext; userId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: memberships = [] } = useQuery(myMembershipsQuery(userId));
  const usable = memberships.filter(isUsable);
  const tenant = ctx.tenant!;

  const current = (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <Building2 className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Active business: </span>
      <span className="truncate font-semibold text-foreground">{tenant.displayName}</span>
    </span>
  );

  if (usable.length <= 1) return current;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 gap-2 px-2" aria-label={`Active business: ${tenant.displayName}. Switch business`}>
          {current}
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        {usable.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => {
              if (m.tenantId === tenant.id) return;
              forgetOtherTenants(queryClient, m.tenantId);
              navigate({ to: "/t/$tenantId", params: { tenantId: m.tenantId } });
            }}
            className="flex items-start gap-2"
          >
            <Check className={cn("mt-0.5 size-4", m.tenantId === tenant.id ? "opacity-100" : "opacity-0")} aria-hidden />
            <span>
              <span className="block">{m.tenant?.displayName}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/select-business", search: { choose: "1" } })}>
          All businesses
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TenantLogo({ tenant }: { tenant: NonNullable<TenantContext["tenant"]> }) {
  const path = (accentIsDark(tenant.accentColour) ? tenant.logoDarkPath : null) ?? tenant.logoPath;
  const url = useQuery(logoUrlQuery(tenant.id, path));
  if (path && url.isPending) return <div className="h-10" aria-hidden />;
  if (path && url.data) {
    return <img key={url.data} src={url.data} alt={tenant.displayName} className="h-10 w-auto max-w-full object-contain object-left" />;
  }
  return (
    <span className="block">
      <span className="block font-display text-sm font-semibold tracking-tight text-sidebar-accent-foreground">{tenant.displayName}</span>
      <BrandMark className="text-[11px] font-normal text-sidebar-foreground" />
    </span>
  );
}

const APPEARANCE_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function UserMenu({ ctx, email, userId }: { ctx: TenantContext; email: string; userId: string }) {
  const personal = useSyncExternalStore(subscribeAppearance, getPersonalAppearance, () => null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = ctx.membership ? ROLE_LABEL[ctx.membership.role] : "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-[16rem] gap-2 px-2 text-sm" aria-label={`Account menu for ${email}`}>
          <CircleUser className="size-5 sm:hidden" aria-hidden />
          <span className="hidden truncate sm:inline">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm text-foreground">{email}</span>
          <span className="block text-xs text-muted-foreground">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={personal ?? "business"}
          onValueChange={(v) => {
            savePersonalAppearance(userId, v === "business" ? null : (v as Appearance)).catch((e) => toast.error(friendlyError(e)));
          }}
        >
          {APPEARANCE_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon className="mr-2 size-4" aria-hidden /> {o.label}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value="business">Business default</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut(queryClient, navigate)}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
