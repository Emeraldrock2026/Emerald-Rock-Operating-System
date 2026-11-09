import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateGB } from "@/lib/domain/dates";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { suggestRebalance, type Suggestion } from "@/lib/rebalance.functions";

type Alloc = { id: string; hours: number; version: number };

export function RebalanceDialog(props: {
  tenantId: string; monday: string; allocations: Alloc[];
  people: { id: string; full_name: string }[]; projectById: Map<string, { reference: string; name: string }>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const suggest = useServerFn(suggestRebalance);
  const name = (id: string) => props.people.find((p) => p.id === id)?.full_name ?? "Someone";

  const run = useMutation({
    mutationFn: () => suggest({ data: { tenantId: props.tenantId, monday: props.monday } }),
    onSuccess: (r) => setPicked(new Set(r.suggestions.map((_, i) => i))),
    onError: (e) => toast.error(friendlyError(e)),
  });

  const apply = useMutation({
    mutationFn: async (list: Suggestion[]) => {
      // Applied in the order the suggestions were checked, each version-checked.
      const remaining = new Map(props.allocations.map((a) => [a.id, { ...a }]));
      for (const s of list) {
        const src = remaining.get(s.allocation_id);
        if (!src) throw new StaleRecordError();
        if (s.hours >= src.hours) {
          const { data, error } = await supabase.from("allocations").update({ employee_id: s.to_employee_id, allocation_date: s.to_date })
            .eq("id", src.id).eq("version", src.version).select("id, version");
          if (error) throw error;
          if (!data?.length) throw new StaleRecordError();
          remaining.delete(src.id);
        } else {
          const { data, error } = await supabase.from("allocations").update({ hours: src.hours - s.hours })
            .eq("id", src.id).eq("version", src.version).select("id, version");
          if (error) throw error;
          if (!data?.length) throw new StaleRecordError();
          src.version = data[0]!.version; src.hours -= s.hours;
          const ins = await supabase.from("allocations").insert({ tenant_id: props.tenantId, employee_id: s.to_employee_id, project_id: s.project_id, allocation_date: s.to_date, hours: s.hours, note: "Rebalanced", client_request_id: crypto.randomUUID() });
          if (ins.error) throw ins.error;
        }
      }
    },
    onSuccess: () => { toast.success("Changes saved."); setOpen(false); run.reset(); },
    onError: (e) => toast.error(`${friendlyError(e)} Some changes may already have been saved — check the planner.`),
    onSettled: props.onChanged,
  });

  const items = run.data?.suggestions ?? [];
  const chosen = items.filter((_, i) => picked.has(i));

  return (
    <>
      <Button variant="outline" size="sm" className="self-end" onClick={() => { setOpen(true); run.mutate(); }}>
        <Sparkles className="mr-1 h-4 w-4" aria-hidden /> Suggest rebalancing
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) run.reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rebalancing suggestions — week of {formatDateGB(props.monday)}</DialogTitle>
            <DialogDescription>AI suggestions, checked against everyone's working hours. Nothing changes until you confirm.</DialogDescription>
          </DialogHeader>
          {run.isPending ? <p className="text-sm text-muted-foreground">Looking at this week's plan…</p> : run.error ? (
            <p className="text-sm text-destructive">{friendlyError(run.error)}</p>
          ) : run.data ? (
            <>
              {items.length ? (
                <ul className="max-h-[55vh] divide-y overflow-y-auto rounded-md border text-sm">
                  {items.map((s, i) => { const p = props.projectById.get(s.project_id); return (
                    <li key={i} className="flex gap-3 p-3">
                      <Checkbox id={`sg${i}`} checked={picked.has(i)} onCheckedChange={(c) => { const n = new Set(picked); if (c) n.add(i); else n.delete(i); setPicked(n); }} className="mt-0.5" />
                      <label htmlFor={`sg${i}`} className="cursor-pointer">
                        <div className="font-medium">Move {s.hours} h of {p ? `${p.reference} · ${p.name}` : "a project"}</div>
                        <div>{name(s.from_employee_id)}, {formatDateGB(s.from_date)} → {name(s.to_employee_id)}, {formatDateGB(s.to_date)}</div>
                        <div className="mt-1 text-muted-foreground">{s.reason}</div>
                      </label>
                    </li>); })}
                </ul>
              ) : null}
              {run.data.note ? <p className="text-sm text-muted-foreground">{run.data.note}</p> : null}
              <div className="flex gap-2">
                {items.length ? (
                  <Button disabled={!chosen.length || apply.isPending}
                    onClick={() => window.confirm(`Save ${chosen.length} change(s) to the planner?`) && apply.mutate(chosen)}>
                    {apply.isPending ? "Saving…" : `Apply ${chosen.length} selected`}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
