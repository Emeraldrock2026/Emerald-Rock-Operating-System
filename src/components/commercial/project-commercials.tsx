import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatGBP, impliedRate, parseCommercialInput } from "@/lib/domain/commercial";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";

type Row = { agreed_fee: number | null; budget_hours: number | null; version: number };
type Hist = { id: number; occurred_at: string; actor_email: string | null; old_values: Row | null; new_values: Row | null };

const hrs = (n: number | null) => (n == null ? "Not set" : `${n.toLocaleString("en-GB")} h`);
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export function ProjectCommercials({ tenantId, projectId, canEdit }: { tenantId: string; projectId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["tenant", tenantId, "commercial", projectId];
  const row = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_commercials").select("agreed_fee, budget_hours, version").eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const history = useQuery({
    queryKey: [...key, "history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("id, occurred_at, actor_email, old_values, new_values")
        .eq("tenant_id", tenantId).eq("category", "commercial").eq("record_table", "project_commercials").eq("record_id", projectId)
        .order("occurred_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Hist[];
    },
  });
  const [editing, setEditing] = useState(false);
  const [fee, setFee] = useState("");
  const [hours, setHours] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const v = parseCommercialInput(fee, hours);
      if (!row.data) {
        const { error } = await supabase.from("project_commercials").insert({ project_id: projectId, tenant_id: tenantId, ...v });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("project_commercials").update(v).eq("project_id", projectId).eq("version", row.data.version).select("project_id");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      }
    },
    onSuccess: () => { toast.success("Fee and budget saved."); setEditing(false); },
    onError: (e) => toast.error(e instanceof Error && !("code" in e) && !(e instanceof StaleRecordError) ? e.message : friendlyError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const start = () => {
    setFee(row.data?.agreed_fee != null ? String(row.data.agreed_fee) : "");
    setHours(row.data?.budget_hours != null ? String(row.data.budget_hours) : "");
    setEditing(true);
  };
  const cur = { agreed_fee: row.data?.agreed_fee ?? null, budget_hours: row.data?.budget_hours ?? null };
  const rate = impliedRate(cur);

  return (
    <section className="rounded-lg border bg-card p-5 md:col-span-2" aria-labelledby="commercial-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="commercial-h" className="text-sm font-semibold">Fee and budget hours</h2>
        {canEdit && !editing && !row.isLoading ? <Button size="sm" variant="outline" onClick={start}>{row.data ? "Edit" : "Add fee and budget"}</Button> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Visible only to people with commercial access.</p>
      {row.error ? <p className="mt-3 text-sm text-destructive">{friendlyError(row.error)}</p> : row.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : editing ? (
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5"><Label htmlFor="fee">Agreed fee (£)</Label><Input id="fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 12,500.00" /></div>
          <div className="grid gap-1.5"><Label htmlFor="bh">Budget hours</Label><Input id="bh" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 120" /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Leave a box empty if it isn't agreed yet.</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Agreed fee</dt><dd className="mt-1 font-medium">{formatGBP(cur.agreed_fee)}</dd></div>
          <div><dt className="text-muted-foreground">Budget hours</dt><dd className="mt-1 font-medium">{hrs(cur.budget_hours)}</dd></div>
          <div><dt className="text-muted-foreground">Implied hourly rate</dt><dd className="mt-1 font-medium">{rate == null ? "—" : formatGBP(rate)}</dd></div>
        </dl>
      )}
      {history.data?.length ? (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Change history ({history.data.length})</summary>
          <ul className="mt-2 divide-y">
            {history.data.map((h) => (
              <li key={h.id} className="py-2">
                <span className="text-muted-foreground">{when(h.occurred_at)} · {h.actor_email ?? "System"}: </span>
                fee {formatGBP(h.old_values?.agreed_fee ?? null)} → {formatGBP(h.new_values?.agreed_fee ?? null)}, budget {hrs(h.old_values?.budget_hours ?? null)} → {hrs(h.new_values?.budget_hours ?? null)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
