import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError } from "@/lib/db-errors";
import { formatTimestamp } from "@/lib/domain/dates";
import { DECISION_LABEL, type FindingDecision } from "@/lib/domain/comparison";
import { compareDrawingRevisions } from "@/lib/compare.functions";

interface Rev { id: string; revision: string }
interface Props {
  tenantId: string; projectId: string; timezone: string; recordId: string; revisions: Rev[];
  canRun: boolean; canReview: boolean; changeModuleOn: boolean;
}

export function ComparisonPanel({ tenantId, projectId, timezone, recordId, revisions, canRun, canReview, changeModuleOn }: Props) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(revisions.at(-2)?.id ?? "");
  const [to, setTo] = useState(revisions.at(-1)?.id ?? "");
  const run = useServerFn(compareDrawingRevisions);
  const key = ["tenant", tenantId, "project", projectId, "comparison", recordId, from, to];
  const q = useQuery({
    queryKey: key, enabled: !!from && !!to && from !== to,
    queryFn: async () => {
      const [f, c] = await Promise.all([
        supabase.from("comparison_findings").select("id, category, location, summary, decision, amended_summary, change_record_id, reviewed_at, project_records!comparison_findings_change_record_id_fkey(reference)")
          .eq("from_revision_id", from).eq("to_revision_id", to).order("created_at"),
        supabase.from("drawing_comparisons").select("id, status, finding_count, new_count, error, ran_at").eq("from_revision_id", from).eq("to_revision_id", to).order("ran_at", { ascending: false }).limit(5),
      ]);
      if (f.error) throw f.error;
      if (c.error) throw c.error;
      return { findings: f.data ?? [], runs: c.data ?? [] };
    },
  });
  const compare = useMutation({
    mutationFn: () => run({ data: { recordId, fromRevisionId: from, toRevisionId: to } }),
    onSuccess: (r) => {
      toast.success(r.found === 0 ? "Comparison finished: no differences were identified." : `Comparison finished: ${r.found} difference(s) suggested, ${r.added} new. Repeats of earlier suggestions were not added again.`);
      qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] });
    },
    onError: (e) => { toast.error(friendlyError(e)); qc.invalidateQueries({ queryKey: key }); },
  });
  if (revisions.length < 2) return <p className="text-sm text-muted-foreground">AI comparison needs at least two revisions.</p>;
  const label = (id: string) => revisions.find((r) => r.id === id)?.revision ?? "";
  const lastRun = q.data?.runs[0];

  return (
    <section aria-label="AI comparison" className="space-y-3 rounded-lg border p-3">
      <h3 className="flex items-center gap-1 text-sm font-semibold"><Sparkles className="h-4 w-4" aria-hidden />AI comparison</h3>
      <p className="text-xs text-muted-foreground">The AI only suggests visible differences. Each one must be accepted, amended or rejected by a project admin. Accepted findings go into a draft change; nothing is approved, valued or treated as an entitlement.</p>
      <div className="flex flex-wrap items-end gap-2">
        <RevSelect label="From" value={from} onChange={setFrom} revisions={revisions} />
        <RevSelect label="To" value={to} onChange={setTo} revisions={revisions} />
        {canRun ? <Button size="sm" disabled={!from || !to || from === to || compare.isPending} onClick={() => compare.mutate()}>{compare.isPending ? "Comparing…" : q.data?.runs.length ? "Run again" : "Compare"}</Button> : null}
      </div>
      {from === to ? <p className="text-xs text-destructive">Choose two different revisions.</p> : null}
      {lastRun ? <p className="text-xs text-muted-foreground">Last run {formatTimestamp(lastRun.ran_at, timezone)}: {lastRun.status === "failed" ? `failed (${lastRun.error ?? "unknown"}), nothing recorded` : `${lastRun.finding_count} suggested, ${lastRun.new_count} new`}.</p> : null}
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.data && q.data.findings.length === 0 && q.data.runs.some((r) => r.status === "completed") ? <p className="text-sm text-muted-foreground">No differences were identified between {label(from)} and {label(to)}.</p> : null}
      <ul className="space-y-2">
        {(q.data?.findings ?? []).map((f) => <FindingRow key={f.id} f={f} canReview={canReview} changeModuleOn={changeModuleOn} onDone={() => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] })} />)}
      </ul>
    </section>
  );
}

function RevSelect({ label, value, onChange, revisions }: { label: string; value: string; onChange: (v: string) => void; revisions: Rev[] }) {
  return (
    <div className="min-w-24"><span className="text-xs">{label}</span>
      <Select value={value} onValueChange={onChange}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>{revisions.map((r) => <SelectItem key={r.id} value={r.id}>{r.revision}</SelectItem>)}</SelectContent></Select></div>
  );
}

function FindingRow({ f, canReview, changeModuleOn, onDone }: {
  f: { id: string; category: string; location: string; summary: string; decision: string; amended_summary: string | null; change_record_id: string | null; project_records: { reference: string } | null };
  canReview: boolean; changeModuleOn: boolean; onDone: () => void;
}) {
  const [amending, setAmending] = useState(false);
  const [text, setText] = useState(f.amended_summary ?? f.summary);
  const m = useMutation({
    mutationFn: async (v: { decision: "accepted" | "amended" | "rejected"; amended?: string }) => {
      const { error } = await supabase.rpc("review_comparison_finding", { _finding: f.id, _decision: v.decision, _amended: v.amended ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => { setAmending(false); onDone(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const decision = f.decision as FindingDecision;
  return (
    <li className="rounded border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{f.category}</Badge>
        {f.location ? <span className="text-xs text-muted-foreground">{f.location}</span> : null}
        <span className="flex-1" />
        <Badge variant={decision === "rejected" ? "outline" : decision === "proposed" ? "secondary" : "default"}>{DECISION_LABEL[decision]}</Badge>
        {f.project_records ? <span className="font-mono text-xs">{f.project_records.reference}</span> : null}
      </div>
      <p className="mt-1">{f.amended_summary ? <><span className="line-through text-muted-foreground">{f.summary}</span> {f.amended_summary}</> : f.summary}</p>
      {canReview ? (
        amending ? (
          <div className="mt-2 space-y-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} aria-label="Amended wording" />
            <div className="flex gap-2"><Button size="sm" disabled={m.isPending || text.trim().length < 5} onClick={() => m.mutate({ decision: "amended", amended: text })}>Save amendment</Button><Button size="sm" variant="ghost" onClick={() => setAmending(false)}>Cancel</Button></div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={m.isPending || !changeModuleOn || decision === "accepted"} onClick={() => m.mutate({ decision: "accepted" })}>Accept</Button>
            <Button size="sm" variant="outline" disabled={m.isPending || !changeModuleOn} onClick={() => setAmending(true)}>Amend</Button>
            <Button size="sm" variant="outline" disabled={m.isPending || decision === "rejected"} onClick={() => m.mutate({ decision: "rejected" })}>Reject</Button>
            {!changeModuleOn ? <span className="text-xs text-muted-foreground">Change control must be on for this project to accept findings.</span> : null}
          </div>
        )
      ) : null}
    </li>
  );
}
