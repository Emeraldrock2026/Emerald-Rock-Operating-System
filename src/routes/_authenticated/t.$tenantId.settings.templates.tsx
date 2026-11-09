import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { RequireModule } from "@/components/app/require-module";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/lib/use-tenant";
import { can } from "@/lib/domain/permissions";
import { MODULES, PROJECT_MODULE_IDS, type ModuleId } from "@/lib/domain/modules";
import { parseFolderPaths } from "@/lib/domain/project-setup";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { projectTemplatesQuery } from "@/lib/project-setup-data";

export const Route = createFileRoute("/_authenticated/t/$tenantId/settings/templates")({
  head: () => ({
    meta: [
      { title: "Project templates — Emerald Rock OS" },
      { name: "description", content: "Reusable project set-ups: modules and folder structures." },
      { property: "og:title", content: "Project templates — Emerald Rock OS" },
      { property: "og:description", content: "Reusable project set-ups: modules and folder structures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModule module="clients_projects">
      <TemplatesPage />
    </RequireModule>
  ),
});

type Tpl = { id: string; name: string; description: string; module_ids: string[]; folder_paths: string[]; active: boolean; version: number };

function TemplatesPage() {
  const { ctx, tenantId } = useTenant();
  const admin = ctx.access ? can(ctx.access, "tenant.settings.manage") : false;
  const q = useQuery({ ...projectTemplatesQuery(tenantId), enabled: admin });
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);
  if (!admin) return (<><SettingsTabs /><PageHeader title="Project templates" description="Only an Owner/Admin can manage project templates." /></>);
  return (
    <>
      <SettingsTabs />
      <PageHeader title="Project templates" description="Set up new projects with your preferred modules and folders. Changing a template doesn't change projects already set up from it."
        actions={editing ? null : <Button onClick={() => setEditing("new")}>New template</Button>} />
      {editing ? <TemplateForm key={editing === "new" ? "new" : editing.id} tpl={editing === "new" ? null : editing} businessModules={ctx.access!.enabledModules} onDone={() => setEditing(null)} /> : null}
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.data && q.data.length === 0 && !editing ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No templates yet.</p> : null}
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {(q.data ?? []).map((t) => (
          <li key={t.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-medium">{t.name}{t.active ? null : <span className="ml-2 text-xs text-muted-foreground">(switched off)</span>}</h2>
                {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}</div>
              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Edit</Button>
            </div>
            <p className="mt-2 text-sm"><span className="text-muted-foreground">Modules:</span> {t.module_ids.map((m) => MODULES[m as ModuleId]?.name ?? m).join(", ") || "none"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Folders:</span> {t.folder_paths.length}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function TemplateForm({ tpl, businessModules, onDone }: { tpl: Tpl | null; businessModules: ReadonlySet<ModuleId>; onDone: () => void }) {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [mods, setMods] = useState<Set<string>>(new Set(tpl?.module_ids ?? []));
  const [active, setActive] = useState(tpl?.active ?? true);
  const [folderError, setFolderError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (v: { name: string; description: string; folder_paths: string[] }) => {
      const row = { ...v, module_ids: PROJECT_MODULE_IDS.filter((m) => mods.has(m)), active };
      if (!tpl) {
        const { error } = await supabase.from("project_templates").insert({ tenant_id: tenantId, ...row });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("project_templates").update(row).eq("id", tpl.id).eq("version", tpl.version).select("id");
        if (error) throw error; if (!data?.length) throw new StaleRecordError();
      }
    },
    onSuccess: () => { toast.success("Template saved."); onDone(); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project-templates"] }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = parseFolderPaths(String(f.get("folders") ?? ""));
    if (!parsed.ok) { setFolderError(parsed.error); return; }
    setFolderError(null);
    save.mutate({ name: String(f.get("name") ?? "").trim(), description: String(f.get("description") ?? "").trim(), folder_paths: parsed.paths });
  };
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-lg border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="t-name">Name</Label><Input id="t-name" name="name" required maxLength={120} defaultValue={tpl?.name} /></div>
        <div className="flex items-end gap-2"><Switch id="t-active" checked={active} onCheckedChange={setActive} /><Label htmlFor="t-active">Available for new projects</Label></div>
      </div>
      <div><Label htmlFor="t-desc">Description</Label><Textarea id="t-desc" name="description" rows={2} maxLength={1000} defaultValue={tpl?.description} /></div>
      <fieldset>
        <legend className="text-sm font-medium">Modules to switch on</legend>
        <p className="text-xs text-muted-foreground">Modules not switched on for the business are skipped when the template is applied.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {PROJECT_MODULE_IDS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox checked={mods.has(m)} onCheckedChange={(v) => setMods((s) => { const n = new Set(s); if (v) n.add(m); else n.delete(m); return n; })} />
              {MODULES[m].name}{businessModules.has(m) ? null : <span className="text-xs text-muted-foreground">(off for business)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor="t-folders">Folder structure</Label>
        <p className="text-xs text-muted-foreground">One folder per line. Use / for subfolders, e.g. "Drawings/Architectural".</p>
        <Textarea id="t-folders" name="folders" rows={6} defaultValue={tpl?.folder_paths.join("\n")} className="font-mono text-sm" />
        {folderError ? <p className="mt-1 text-sm text-destructive" role="alert">{folderError}</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">Report templates and register settings will be added here when those modules are built.</p>
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>Save template</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}
