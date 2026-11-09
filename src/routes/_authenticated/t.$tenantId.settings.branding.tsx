import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageOff, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { brandingWarnings, DEFAULT_BRANDING, HEX, logoFileError, type Appearance } from "@/lib/domain/brand";
import { accentIsDark, brandStyle, BRANDING_BUCKET, logoUrlQuery } from "@/lib/branding";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/t/$tenantId/settings/branding")({
  head: () => ({
    meta: [
      { title: "Business branding — Emerald Rock OS" },
      { name: "description", content: "Logo, colours and default appearance for this business." },
      { property: "og:title", content: "Business branding — Emerald Rock OS" },
      { property: "og:description", content: "Logo, colours and default appearance for this business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrandingPage,
});

interface Form {
  displayName: string;
  primary: string;
  accent: string;
  appearance: Appearance;
  logoPath: string | null;
  logoDarkPath: string | null;
}

function readDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("That file isn't a readable image.")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function BrandingPage() {
  const { ctx, tenantId } = useTenant();
  const qc = useQueryClient();
  const t = ctx.tenant!;
  const allowed = ctx.access ? can(ctx.access, "tenant.settings.manage") : false;
  const saved: Form = { displayName: t.displayName, primary: t.brandColour.toUpperCase(), accent: t.accentColour.toUpperCase(), appearance: t.defaultAppearance, logoPath: t.logoPath, logoDarkPath: t.logoDarkPath };
  const [form, setForm] = useState<Form>(saved);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  useEffect(() => { setForm(saved); /* reload when the saved record changes */ }, [t.version, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const warnings = brandingWarnings(form.primary, form.accent);
  const valid = HEX.test(form.primary) && HEX.test(form.accent) && form.displayName.trim().length > 0 && form.displayName.trim().length <= 80;

  const upload = useMutation({
    mutationFn: async ({ file, which }: { file: File; which: "logoPath" | "logoDarkPath" }) => {
      const pre = logoFileError(file);
      if (pre) throw new Error(pre);
      const dimsErr = logoFileError(file, await readDims(file));
      if (dimsErr) throw new Error(dimsErr);
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${tenantId}/${which === "logoPath" ? "logo" : "logo-dark"}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw error;
      return { path, which, url: URL.createObjectURL(file) };
    },
    onSuccess: ({ path, which, url }) => { setLocalUrls((u) => ({ ...u, [path]: url })); set(which, path); toast.success("Logo uploaded. Save to apply it."); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (warnings.length && !window.confirm(`${warnings.join("\n")}\n\nSave these colours anyway?`)) return false;
      const { data, error } = await supabase.from("tenants").update({
        display_name: form.displayName.trim(), brand_colour: form.primary, accent_colour: form.accent,
        default_appearance: form.appearance, logo_path: form.logoPath, logo_dark_path: form.logoDarkPath,
      }).eq("id", tenantId).eq("version", t.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
      return true;
    },
    onSuccess: (ok) => { if (ok) toast.success("Branding saved for everyone in this business."); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "context"] }),
  });

  if (!allowed) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Settings" description="Only an Owner/Admin can change business branding." />
        <SettingsTabs />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <PageHeader title="Settings" description="Branding applies to everyone in this business. Status colours (over capacity, errors, warnings) never change with branding." />
      <SettingsTabs />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor="dn">Business display name</Label>
            <Input id="dn" value={form.displayName} maxLength={80} onChange={(e) => set("displayName", e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LogoField label="Main logo" hint="Used on light navigation." tenantId={tenantId} path={form.logoPath} localUrls={localUrls}
              busy={upload.isPending} onFile={(f) => upload.mutate({ file: f, which: "logoPath" })} onRemove={() => set("logoPath", null)} />
            <LogoField label="Logo for dark backgrounds" hint="Optional. Used when the navigation is dark." dark tenantId={tenantId} path={form.logoDarkPath} localUrls={localUrls}
              busy={upload.isPending} onFile={(f) => upload.mutate({ file: f, which: "logoDarkPath" })} onRemove={() => set("logoDarkPath", null)} />
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">PNG, JPG or WebP, up to 2 MB. Logos keep their proportions.</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColourField id="pc" label="Primary colour" hint="Buttons, links, selected items." value={form.primary} onChange={(v) => set("primary", v)} />
            <ColourField id="ac" label="Accent colour" hint="Navigation background." value={form.accent} onChange={(v) => set("accent", v)} />
          </div>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="da">Default appearance</Label>
            <Select value={form.appearance} onValueChange={(v) => set("appearance", v as Appearance)}>
              <SelectTrigger id="da"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System (follow each device)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">People who've chosen their own appearance keep their choice.</p>
          </div>

          {warnings.length ? (
            <div role="status" className="space-y-1 rounded-md border border-warning bg-warning-surface p-3 text-sm text-warning-foreground">
              {warnings.map((w) => <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{w}</p>)}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!dirty || !valid || save.isPending || upload.isPending}>{save.isPending ? "Saving…" : "Save branding"}</Button>
            <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setForm(saved)}>Cancel</Button>
            <Button type="button" variant="outline" className="ml-auto"
              onClick={() => { if (window.confirm("Restore the default Emerald Rock OS colours and remove both logos? Nothing changes until you save.")) setForm((f) => ({ ...f, primary: DEFAULT_BRANDING.primary, accent: DEFAULT_BRANDING.accent, appearance: DEFAULT_BRANDING.appearance, logoPath: null, logoDarkPath: null })); }}>
              Restore default branding
            </Button>
          </div>
        </form>

        <section aria-label="Live preview" className="space-y-4">
          <h2 className="text-sm font-semibold">Live preview</h2>
          {HEX.test(form.primary) && HEX.test(form.accent) ? (
            <>
              <Preview mode="light" form={form} tenantId={tenantId} localUrls={localUrls} />
              <Preview mode="dark" form={form} tenantId={tenantId} localUrls={localUrls} />
            </>
          ) : <p className="text-sm text-muted-foreground">Enter valid hex colours to see the preview.</p>}
        </section>
      </div>
    </div>
  );
}

function useLogoSrc(tenantId: string, path: string | null, localUrls: Record<string, string>) {
  const local = path ? localUrls[path] : undefined;
  const signed = useQuery({ ...logoUrlQuery(tenantId, path), enabled: !!path && !local });
  return local ?? signed.data ?? null;
}

function LogoField(props: { label: string; hint: string; dark?: boolean; tenantId: string; path: string | null; localUrls: Record<string, string>; busy: boolean; onFile: (f: File) => void; onRemove: () => void }) {
  const src = useLogoSrc(props.tenantId, props.path, props.localUrls);
  const id = `logo-${props.dark ? "d" : "l"}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <div className={cn("flex h-20 items-center justify-center rounded-md border p-2", props.dark ? "dark bg-sidebar" : "bg-card")}>
        {src ? <img src={src} alt={`${props.label} preview`} className="max-h-full max-w-full object-contain" /> : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ImageOff className="size-4" aria-hidden />No logo — the business name is shown</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{props.hint}</p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={props.busy}>
          <label htmlFor={id} className="cursor-pointer"><Upload className="mr-1 size-4" aria-hidden />{props.path ? "Replace" : "Upload"}</label>
        </Button>
        <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onFile(f); e.target.value = ""; }} />
        {props.path ? <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>Remove</Button> : null}
      </div>
    </div>
  );
}

function ColourField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const ok = HEX.test(value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={ok ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1" />
        <Input id={id} value={value} maxLength={7} aria-invalid={!ok} className="font-mono uppercase"
          onChange={(e) => onChange(e.target.value.trim().toUpperCase())} />
      </div>
      <p className={cn("text-xs", ok ? "text-muted-foreground" : "text-destructive")}>{ok ? hint : "Use a hex colour like #2F8C6C."}</p>
    </div>
  );
}

function Preview({ mode, form, tenantId, localUrls }: { mode: "light" | "dark"; form: Form; tenantId: string; localUrls: Record<string, string> }) {
  const logoPath = (accentIsDark(form.accent) ? form.logoDarkPath : null) ?? form.logoPath;
  const src = useLogoSrc(tenantId, logoPath, localUrls);
  return (
    <div className={cn(mode === "dark" && "dark")}>
      <div className="brand-scope overflow-hidden rounded-lg border border-border bg-background text-foreground" style={brandStyle(form.primary, form.accent)}>
        <div className="flex">
          <div className="w-36 shrink-0 bg-sidebar p-3 text-xs">
            {src ? <img src={src} alt="" className="mb-3 h-7 w-auto max-w-full object-contain object-left" /> : <div className="mb-3 font-display font-semibold text-sidebar-accent-foreground">{form.displayName || "Business"}</div>}
            <div className="rounded bg-sidebar-accent px-2 py-1 font-medium text-sidebar-accent-foreground">Planner</div>
            <div className="px-2 py-1 text-sidebar-foreground">Projects</div>
            <div className="px-2 py-1 text-sidebar-foreground">People</div>
          </div>
          <div className="min-w-0 flex-1 space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{mode === "dark" ? "Dark" : "Light"} mode</span>
              <div className="flex gap-1.5">
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Save</span>
                <span className="rounded-md border border-input px-2 py-1 text-xs">Cancel</span>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-2 text-xs">
              <div className="text-muted-foreground">Active projects</div>
              <div className="font-display text-lg font-semibold">12</div>
              <span className="text-primary underline">View all</span>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1 font-medium">Person</th><th className="py-1 font-medium">Mon</th></tr></thead>
              <tbody>
                <tr className="border-b border-border"><td className="py-1">A. Patel</td><td>7.5 / 7.5</td></tr>
                <tr><td className="py-1">J. Reid</td><td className="font-medium text-destructive">9 / 7.5 ⚠ over</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
