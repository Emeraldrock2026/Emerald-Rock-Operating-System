import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Monitor, Moon, Sun, Building2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { useTenant } from "@/lib/use-tenant";
import { getPersonalAppearance, savePersonalAppearance, subscribeAppearance } from "@/lib/appearance";
import type { Appearance } from "@/lib/domain/brand";
import { friendlyError } from "@/lib/db-errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/t/$tenantId/settings/appearance")({
  head: () => ({
    meta: [
      { title: "My appearance — Emerald Rock OS" },
      { name: "description", content: "Choose light, dark or system appearance for your account." },
      { property: "og:title", content: "My appearance — Emerald Rock OS" },
      { property: "og:description", content: "Choose light, dark or system appearance for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppearancePage,
});

const LABEL: Record<Appearance, string> = { light: "Light", dark: "Dark", system: "System" };

function AppearancePage() {
  const { ctx, user } = useTenant();
  const personal = useSyncExternalStore(subscribeAppearance, getPersonalAppearance, () => null);
  const [busy, setBusy] = useState(false);
  const businessDefault = ctx.tenant?.defaultAppearance ?? "system";
  const options: { value: Appearance | null; label: string; hint: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", hint: "Always light.", icon: Sun },
    { value: "dark", label: "Dark", hint: "Always dark.", icon: Moon },
    { value: "system", label: "System", hint: "Follows your device and changes with it.", icon: Monitor },
    { value: null, label: "Business default", hint: `Use ${ctx.tenant?.displayName}'s setting (currently ${LABEL[businessDefault]}).`, icon: Building2 },
  ];
  const choose = async (v: Appearance | null) => {
    setBusy(true);
    try { await savePersonalAppearance(user.id, v); toast.success("Appearance saved for your account."); }
    catch (e) { toast.error(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Your appearance applies only to you, on every device you sign in on." />
      <SettingsTabs />
      <fieldset disabled={busy}>
        <legend className="mb-3 text-sm font-semibold">Appearance</legend>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const on = personal === o.value;
            return (
              <button key={o.label} type="button" role="radio" aria-checked={on} onClick={() => choose(o.value)}
                className={cn("flex items-start gap-3 rounded-lg border bg-card p-4 text-left hover:bg-muted", on && "border-primary ring-1 ring-primary")}>
                <o.icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                <span><span className="block text-sm font-medium">{o.label}{on ? " (selected)" : ""}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
