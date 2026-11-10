import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { READINESS_REQUIREMENTS, readinessRequirements } from "@/lib/domain/readiness";

export const readinessSettingsQuery = (tenantId: string) => ({
  queryKey: ["tenant", tenantId, "readiness-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("tenant_readiness_settings").select("config, version").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw error;
    return data;
  },
});

// Owner/Admin only (database policy refuses anyone else); everyone in the business reads.
export function ReadinessSettingsDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ ...readinessSettingsQuery(tenantId), enabled: open });
  const current = readinessRequirements(q.data?.config);
  const save = useMutation({
    mutationFn: async (config: Record<string, boolean>) => {
      if (q.data) {
        const { data, error } = await supabase.from("tenant_readiness_settings").update({ config }).eq("tenant_id", tenantId).eq("version", q.data.version).select("version");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      } else {
        const { error } = await supabase.from("tenant_readiness_settings").insert({ tenant_id: tenantId, config });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Readiness requirements saved."); onOpenChange(false); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "readiness-settings"] }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Readiness requirements</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Choose what every appointment in this business must have before it shows as ready. Changes apply to all appointments and are kept in the audit history.</p>
        {q.error ? <p className="text-destructive">{friendlyError(q.error)}</p> : q.isLoading ? <p className="text-sm">Loading…</p> : (
          <form id="readiness-settings" key={q.data?.version ?? "new"} className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save.mutate(Object.fromEntries(READINESS_REQUIREMENTS.map(([k]) => [k, f.get(k) === "on"]))); }}>
            {READINESS_REQUIREMENTS.map(([k, label]) => (
              <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={current[k]} className="mt-0.5" />{label}</label>
            ))}
          </form>
        )}
        <DialogFooter><Button type="submit" form="readiness-settings" disabled={save.isPending || q.isLoading}>Save requirements</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
