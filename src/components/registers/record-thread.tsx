import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/db-errors";
import { formatTimestamp } from "@/lib/domain/dates";

/** Shared comments and links for any project record. Links to records you can't open stay listed with the reason. */
export function RecordThread({ tenantId, projectId, recordId, timezone, canWrite }: { tenantId: string; projectId: string; recordId: string; timezone: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const base = ["tenant", tenantId, "project", projectId, "thread", recordId];
  const [body, setBody] = useState("");
  const [ref, setRef] = useState("");
  const comments = useQuery({
    queryKey: [...base, "comments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("record_comments").select("id, body, created_at").eq("record_id", recordId).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const links = useQuery({
    queryKey: [...base, "links"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("linked_record_summary", { _record: recordId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const addComment = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("record_comments").insert({ tenant_id: tenantId, record_id: recordId, body: body.trim(), author_id: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); void qc.invalidateQueries({ queryKey: base }); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const addLink = useMutation({
    mutationFn: async () => {
      const { data: target, error: e1 } = await supabase.from("project_records").select("id").eq("project_id", projectId).eq("reference", ref.trim().toUpperCase()).maybeSingle();
      if (e1) throw e1;
      if (!target) throw new Error("No record with that reference on this project that you can see.");
      if (target.id === recordId) throw new Error("A record can't link to itself.");
      const { error } = await supabase.from("record_links").insert({ tenant_id: tenantId, from_record_id: recordId, to_record_id: target.id });
      if (error) throw error;
    },
    onSuccess: () => { setRef(""); void qc.invalidateQueries({ queryKey: base }); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <section aria-label="Links and comments" className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Linked records</h3>
      {!links.data?.length ? <p className="text-xs text-muted-foreground">No links.</p> : (
        <ul className="space-y-1 text-sm">{links.data.map((l) => (
          <li key={l.record_id}><span className="font-mono text-xs">{l.reference}</span> {l.accessible ? l.title : <span className="text-muted-foreground">— {l.restriction}</span>}</li>
        ))}</ul>
      )}
      {canWrite ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) addLink.mutate(); }}>
          <Input aria-label="Reference to link" placeholder="e.g. ERC-0001-RFI-0002" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!ref.trim() || addLink.isPending}>Link</Button>
        </form>
      ) : null}
      <h3 className="pt-2 text-sm font-semibold">Comments</h3>
      {!comments.data?.length ? <p className="text-xs text-muted-foreground">No comments.</p> : (
        <ul className="space-y-2 text-sm">{comments.data.map((c) => (
          <li key={c.id} className="rounded bg-muted/40 p-2"><p className="whitespace-pre-wrap">{c.body}</p><p className="text-xs text-muted-foreground">{formatTimestamp(c.created_at, timezone)}</p></li>
        ))}</ul>
      )}
      {canWrite ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) addComment.mutate(); }}>
          <Textarea aria-label="New comment" rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!body.trim() || addComment.isPending}>Add comment</Button>
        </form>
      ) : null}
    </section>
  );
}
