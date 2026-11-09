import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/db-errors";
import { MODULES, BUSINESS_MODULE_IDS, PROJECT_MODULE_IDS, isModuleId, switchBlockedReason, type ModuleId } from "@/lib/domain/modules";
import { setModuleEnabled } from "@/lib/platform";

export function ModulesSection({ tenantId, businessName, enabledIds }: { tenantId: string; businessName: string; enabledIds: string[] }) {
  const queryClient = useQueryClient();
  const enabled = new Set(enabledIds.filter(isModuleId));
  const [pending, setPending] = useState<ModuleId | null>(null);
  const [busy, setBusy] = useState(false);
  const turningOn = pending ? !enabled.has(pending) : false;

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      await setModuleEnabled(tenantId, pending, turningOn);
      toast.success(`${MODULES[pending].name} switched ${turningOn ? "on" : "off"}.`);
      setPending(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
    }
  }

  function renderList(ids: readonly ModuleId[]) {
    return (
      <ul className="mt-2 divide-y divide-border">
        {ids.map((id) => {
          const on = enabled.has(id);
          const reason = switchBlockedReason(id, enabled);
          const deps = MODULES[id].dependsOn as readonly ModuleId[];
          const switchId = `module-${id}`;
          return (
            <li key={id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <label htmlFor={switchId} className="text-sm font-medium text-foreground">{MODULES[id].name}</label>
                <p className="text-xs text-muted-foreground">
                  {deps.length ? `Needs ${deps.map((d) => MODULES[d].name).join(", ")}.` : "No dependencies."}
                  {!MODULES[id].built ? <span className="block">Pages not built yet. Switching on lets projects choose it ready for when they are.</span> : null}
                  {reason ? <span className="block text-foreground">{reason}</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" aria-hidden>{on ? "On" : "Off"}</span>
                <Switch id={switchId} checked={on} disabled={!!reason || busy} onCheckedChange={() => setPending(id)} />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="rounded-md border border-border bg-card p-5 md:col-span-2" aria-labelledby="modules-heading">
      <h2 id="modules-heading" className="font-medium text-foreground">Modules</h2>
      <p className="mt-1 text-sm text-muted-foreground">Switching a module off hides it from everyone in this business. Its data is kept.</p>
      <h3 className="mt-4 text-sm font-semibold text-foreground">Business modules</h3>
      {renderList(BUSINESS_MODULE_IDS)}
      <h3 className="mt-6 text-sm font-semibold text-foreground">Project modules</h3>
      <p className="text-xs text-muted-foreground">Project admins choose from the ones switched on here for each of their projects.</p>
      {renderList(PROJECT_MODULE_IDS)}


      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? `Switch ${turningOn ? "on" : "off"} ${MODULES[pending].name} for ${businessName}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {turningOn
                ? "People in this business will see it straight away, according to their role."
                : "Nobody in this business will be able to see or change this module's information until it's switched back on. Nothing is deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void apply(); }}>
              {turningOn ? "Switch on" : "Switch off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
