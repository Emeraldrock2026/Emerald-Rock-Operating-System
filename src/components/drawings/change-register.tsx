import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatTimestamp } from "@/lib/domain/dates";
import { DECISION_LABEL, type FindingDecision } from "@/lib/domain/comparison";

interface Props { tenantId: string; projectId: string; timezone: string; canEdit: boolean; historicOnly: boolean; focus?: { id: string; n: number } | null }

export function ChangeRegister({ tenantId, projectId, timezone, canEdit, historicOnly, focus }: Props) {
  const q = useQuery({
    queryKey: ["tenant", tenantId, "project", projectId, "changes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_records")
        .select("id, reference, title, description, status, updated_at, version, comparison_findings!comparison_findings_tenant_id_change_record_id_fkey(id, category, location, summary, amended_summary, decision)")
        .eq("project_id", projectId).eq("module_id", "change_control").order("reference", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!focus || !q.data?.some((c) => c.id === focus.id)) return;
    const el = document.getElementById(`change-${focus.id}`);
    el?.scrollIntoView({ block: "center" }); el?.focus();
  }, [focus, q.data]);
  return (
    <div className="space-y-3">
      {historicOnly ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Change control is switched off. You can look at earlier changes as a project admin, but nothing can be edited.</p> : null}
      <p className="text-xs text-muted-foreground">Draft changes are created when a project admin accepts drawing comparison findings. A draft is not an instruction, approval, entitlement or valuation.</p>
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No changes yet.</p> : (
        <ul className="space-y-3">{(q.data ?? []).map((c) => <ChangeCard key={c.id} highlighted={focus?.id === c.id} c={c} tenantId={tenantId} projectId={projectId} timezone={timezone} canEdit={canEdit && !historicOnly} />)}</ul>
      )}
    </div>
  );
}

type Change = { id: string; reference: string; title: string; description: string; status: string; updated_at: string; version: number;
  comparison_findings: { id: string; category: string; location: string; summary: string; amended_summary: string | null; decision: string }[] };

function ChangeCard({ c, tenantId, projectId, timezone, canEdit }: { c: Change; tenantId: string; projectId: string; timezone: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [desc, setDesc] = useState(c.description);
  const save = useMutation({
    mutationFn: async (patch: { title?: string; description?: string; status?: string }) => {
      const { data, error } = await supabase.from("project_records").update(patch).eq("id", c.id).eq("version", c.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] }); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{c.reference}</span>
        <span className="font-medium">{c.title}</span>
        <span className="flex-1" />
        <Badge variant={c.status === "draft" ? "secondary" : "outline"}>{c.status === "draft" ? "Draft" : c.status === "withdrawn" ? "Withdrawn" : c.status}</Badge>
      </div>
      {editing ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ title: title.trim(), description: desc }); }}>
          <Label htmlFor={`t-${c.id}`}>Title</Label><Input id={`t-${c.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <Label htmlFor={`d-${c.id}`}>Description</Label><Textarea id={`d-${c.id}`} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending || !title.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      ) : <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
        {c.comparison_findings.map((f) => <li key={f.id}><span className="text-xs text-muted-foreground">{f.category}{f.location ? ` · ${f.location}` : ""} · {DECISION_LABEL[f.decision as FindingDecision]}</span><br />{f.amended_summary ?? f.summary}</li>)}
        {c.comparison_findings.length === 0 ? <li className="list-none text-muted-foreground">No findings currently in this change.</li> : null}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Updated {formatTimestamp(c.updated_at, timezone)}</span>
        <span className="flex-1" />
        {canEdit && !editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
        {canEdit && c.status === "draft" ? <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ status: "withdrawn" })}>Withdraw draft</Button> : null}
        {canEdit && c.status === "withdrawn" ? <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ status: "draft" })}>Reopen as draft</Button> : null}
      </div>
    </li>
  );
}
