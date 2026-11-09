import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB, todayIn, type DateOnly } from "@/lib/domain/dates";
import { fileReplaceable, isLateForecast, isOverdue, nextStatuses, REGISTERS, statusProblem, type RegisterModule } from "@/lib/domain/registers";
import { fileStoragePath } from "@/lib/domain/project-files";
import { uploadWithProgress } from "@/components/project-files/project-files-panel";
import { RecordThread } from "./record-thread";

interface Props { tenantId: string; projectId: string; module: RegisterModule; timezone: string; canContribute: boolean; canManage: boolean; historicOnly: boolean; focus?: { id: string; n: number } | null }
type Rec = { id: string; reference: string; title: string; description: string; status: string; is_closed: boolean; due_date: string | null; completed_on: string | null; fields: Record<string, unknown>; version: number };

export function RegisterPanel(p: Props) {
  const c = REGISTERS[p.module];
  const newLabel = `New ${/^[A-Z]{2,}/.test(c.singular) ? c.singular : c.singular.toLowerCase()}`;
  const qc = useQueryClient();
  const [show, setShow] = useState<"open" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const key = ["tenant", p.tenantId, "project", p.projectId, "register", p.module];
  const today = todayIn(p.timezone);
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_records").select("id, reference, title, description, status, is_closed, due_date, completed_on, fields, version")
        .eq("project_id", p.projectId).eq("module_id", p.module).order("reference", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rec[];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("project_records")
        .insert({ tenant_id: p.tenantId, project_id: p.projectId, module_id: p.module, title: newLabel, status: c.firstStatus, fields: {} } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => { void qc.invalidateQueries({ queryKey: key }); setOpenId(id); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  useEffect(() => {
    if (p.focus && q.data?.some((r) => r.id === p.focus!.id)) { setShow("all"); setOpenId(p.focus.id); }
  }, [p.focus, q.data]);
  const rows = (q.data ?? []).filter((r) => show === "all" || !r.is_closed);
  const open = q.data?.find((r) => r.id === openId) ?? null;
  return (
    <div className="space-y-3">
      {p.historicOnly ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{c.label} are switched off for this project. As a project admin you can look at earlier records, but nothing can be changed.</p> : null}
      <p className="text-xs text-muted-foreground">{c.notice}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={show === "open" ? "default" : "outline"} onClick={() => setShow("open")}>Open</Button>
        <Button size="sm" variant={show === "all" ? "default" : "outline"} onClick={() => setShow("all")}>All</Button>
        {p.canContribute && !p.historicOnly ? <Button className="ml-auto" onClick={() => create.mutate()} disabled={create.isPending}>{newLabel}</Button> : null}
      </div>
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">Nothing to show.</p> : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((r) => {
            const late = c.usesDueDate && isOverdue(r.due_date as DateOnly | null, today, r.is_closed);
            const lateForecast = p.module === "deliveries" && isLateForecast(r.due_date as DateOnly | null, (r.fields["forecast_on"] as DateOnly | undefined) || null, r.is_closed);
            return (
              <li key={r.id}><button className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-muted/40" onClick={() => setOpenId(r.id)}>
                <span className="font-mono text-xs">{r.reference}</span><span className="font-medium">{r.title}</span>
                <Badge variant={r.is_closed ? "secondary" : "outline"}>{c.statusLabel[r.status] ?? r.status}</Badge>
                {p.module === "programmes" && r.fields["revision"] ? <span className="text-xs text-muted-foreground">Rev {String(r.fields["revision"])}</span> : null}
                {lateForecast ? <Badge variant="destructive">Forecast {formatDateGB(r.fields["forecast_on"] as DateOnly)} is after required date</Badge> : null}
                {c.usesDueDate && r.due_date ? <span className={`ml-auto text-xs ${late ? "font-medium text-destructive" : "text-muted-foreground"}`}>{late ? "Overdue · " : "Due "}{formatDateGB(r.due_date as DateOnly)}</span> : null}
              </button></li>
            );
          })}
        </ul>
      )}
      {open ? <RecordDialog {...p} rec={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function RecordDialog(p: Props & { rec: Rec; onClose: () => void }) {
  const c = REGISTERS[p.module];
  const qc = useQueryClient();
  const { rec } = p;
  const editable = p.canContribute && !p.historicOnly && !(rec.is_closed && !p.canManage);
  const initFields = Object.fromEntries(c.fields.map((f) => [f.key, String(rec.fields[f.key] ?? "")]));
  const [title, setTitle] = useState(rec.title);
  const [desc, setDesc] = useState(rec.description);
  const [due, setDue] = useState(rec.due_date ?? "");
  const [fields, setFields] = useState<Record<string, string>>(initFields);
  const [pct, setPct] = useState<number | null>(null);
  const dirty = title !== rec.title || desc !== rec.description || due !== (rec.due_date ?? "") || c.fields.some((f) => fields[f.key] !== initFields[f.key]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", p.tenantId, "project", p.projectId] });

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data, error } = await supabase.from("project_records").update(patch as never).eq("id", rec.id).eq("version", rec.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Saved."); void invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const save = () => update.mutate({ title: title.trim() || c.singular, description: desc, due_date: c.usesDueDate ? (due || null) : null, fields: { ...rec.fields, ...fields } });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fileId = (rec.fields["file_id"] as string | undefined) ?? crypto.randomUUID();
      const path = fileStoragePath({ tenantId: p.tenantId, projectId: p.projectId, module: p.module as never, fileId, uploadId: crypto.randomUUID(), fileName: file.name });
      setPct(0);
      await uploadWithProgress(path, file, setPct);
      const { data: v, error } = await supabase.rpc("record_project_file_version", { _file: fileId, _project: p.projectId, _module: p.module, _path: path, _file_name: file.name, _mime: file.type, _size: file.size, _note: "", _title: `${rec.reference} ${c.singular}` } as never);
      if (error) throw error;
      const { data, error: e2 } = await supabase.from("project_records").update({ fields: { ...rec.fields, file_id: fileId, file_version: v, file_name: file.name } } as never).eq("id", rec.id).eq("version", rec.version).select("id");
      if (e2) throw e2;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success(`${c.file?.label ?? "File"} uploaded.`); void invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => setPct(null),
  });
  const openFile = async () => {
    const { data: v } = await supabase.from("project_file_versions").select("storage_path").eq("file_id", String(rec.fields["file_id"])).eq("version_no", Number(rec.fields["file_version"])).maybeSingle();
    if (!v) { toast.error("That file isn't available to you."); return; }
    const { data } = await supabase.storage.from("project-files").createSignedUrl(v.storage_path, 300);
    if (data) window.open(data.signedUrl, "_blank", "noopener");
  };
  const moves = p.historicOnly || !p.canContribute ? [] : nextStatuses(p.module, rec.status, p.canManage);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) p.onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{rec.reference} · {c.singular}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{c.notice}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Status:</span><Badge variant={rec.is_closed ? "secondary" : "outline"}>{c.statusLabel[rec.status]}</Badge>
          {rec.completed_on ? <span className="text-xs text-muted-foreground">Closed {formatDateGB(rec.completed_on as DateOnly)}</span> : null}
          {moves.map((s) => {
            const problem = statusProblem(p.module, s, rec.fields);
            return <Button key={s} size="sm" variant="outline" title={problem ?? undefined} disabled={dirty || !!problem || update.isPending} onClick={() => update.mutate({ status: s })}>Mark {c.statusLabel[s]!.toLowerCase()}</Button>;
          })}
        </div>
        {dirty && moves.length ? <p className="text-xs text-muted-foreground">Save your changes before changing the status.</p> : null}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div><Label htmlFor="rg-title">Title</Label><Input id="rg-title" value={title} maxLength={300} disabled={!editable} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label htmlFor="rg-desc">Description</Label><Textarea id="rg-desc" rows={2} value={desc} maxLength={5000} disabled={!editable} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.usesDueDate ? <div><Label htmlFor="rg-due">{c.dueLabel ?? "Due"}</Label><Input id="rg-due" type="date" value={due} disabled={!editable} onChange={(e) => setDue(e.target.value)} /></div> : null}
            {c.fields.map((f) => (
              <div key={f.key} className={f.kind === "long" ? "sm:col-span-2" : ""}>
                <Label htmlFor={`rg-${f.key}`}>{f.label}</Label>
                {f.kind === "choice"
                  ? <select id={`rg-${f.key}`} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={fields[f.key]} disabled={!editable} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}><option value="">Choose…</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : f.kind === "long"
                  ? <Textarea id={`rg-${f.key}`} rows={3} maxLength={5000} value={fields[f.key]} disabled={!editable} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                  : <Input id={`rg-${f.key}`} type={f.kind === "date" ? "date" : "text"} maxLength={200} value={fields[f.key]} disabled={!editable} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />}
              </div>
            ))}
          </div>
          {editable ? <Button type="submit" disabled={!dirty || update.isPending}>Save</Button> : null}
        </form>
        {c.file ? (
          <section aria-label={c.file.label} className="space-y-2 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">{c.file.label}</h3>
            {rec.fields["file_id"] ? <div className="flex items-center gap-2 text-sm"><span>{String(rec.fields["file_name"] ?? c.file.label)} (version {String(rec.fields["file_version"])})</span><Button size="sm" variant="ghost" onClick={() => void openFile()}>Open</Button></div>
              : <p className="text-xs text-muted-foreground">No file yet.</p>}
            {editable && fileReplaceable(p.module, rec.status) ? (
              <div><Label htmlFor="rg-file">{rec.fields["file_id"] ? "Replace with a new version" : "Upload file"}</Label>
                <Input id="rg-file" type="file" disabled={upload.isPending || dirty} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
                {pct !== null ? <p className="text-xs text-muted-foreground">Uploading… {pct}%</p> : null}
                <p className="text-xs text-muted-foreground">Earlier versions are kept. Uploading doesn't change the status. Once {c.file.lockedIn.map((s) => c.statusLabel[s]!.toLowerCase()).join(" or ")}, the file can't be replaced.</p></div>
            ) : null}
          </section>
        ) : null}
        <RecordThread tenantId={p.tenantId} projectId={p.projectId} recordId={rec.id} timezone={p.timezone} canWrite={p.canContribute && !p.historicOnly} />
      </DialogContent>
    </Dialog>
  );
}
