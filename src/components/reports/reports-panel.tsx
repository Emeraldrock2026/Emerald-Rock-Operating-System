import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB, formatTimestamp, type DateOnly } from "@/lib/domain/dates";
import { canonicalSnapshot, DELAY_DISCLAIMER, MAX_REPORT_PHOTOS, REPORT_FIELDS, REPORT_LABEL, reportFileName, reportProblems, type ReportModule, type ReportPhoto, type ReportSnapshot } from "@/lib/domain/reports";
import { fileStoragePath } from "@/lib/domain/project-files";
import { BRANDING_BUCKET } from "@/lib/branding";
import { buildReportPdf, sha256Hex } from "@/lib/report-pdf";
import { uploadWithProgress } from "@/components/project-files/project-files-panel";

const BUCKET = "project-files";

interface Props {
  tenantId: string; projectId: string; module: ReportModule; timezone: string;
  project: { reference: string; name: string };
  brand: { businessName: string; colour: string; logoPath: string | null };
  canContribute: boolean; canIssue: boolean; historicOnly: boolean; photosAvailable: boolean;
}

type Rec = { id: string; reference: string; title: string; status: string; version: number; fields: Record<string, unknown>; updated_at: string };
type Issue = { id: string; issue_no: number; issued_at: string; file_id: string; file_version: number; note: string; content_hash: string };

export function ReportsPanel(p: Props) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const key = ["tenant", p.tenantId, "project", p.projectId, "reports", p.module];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_records").select("id, reference, title, status, version, fields, updated_at")
        .eq("project_id", p.projectId).eq("module_id", p.module).order("reference", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rec[];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const title = p.module === "progress_reports" ? "Progress report" : "Delay report";
      const { data, error } = await supabase.from("project_records")
        .insert({ tenant_id: p.tenantId, project_id: p.projectId, module_id: p.module, title, status: "draft", fields: {} } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => { void qc.invalidateQueries({ queryKey: key }); setOpenId(id); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const open = q.data?.find((r) => r.id === openId) ?? null;
  return (
    <div className="space-y-3">
      {p.historicOnly ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{REPORT_LABEL[p.module]}s are switched off for this project. As a project admin you can still open earlier reports and issued copies, but nothing can be changed or issued.</p> : null}
      {p.module === "delay_reports" ? <p className="text-xs text-muted-foreground">{DELAY_DISCLAIMER}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Team members draft reports; project admins issue them. Each issue is saved as a fixed PDF copy. Email issue isn't set up yet.</p>
        {p.canContribute && !p.historicOnly ? <Button onClick={() => create.mutate()} disabled={create.isPending}>New {REPORT_LABEL[p.module].toLowerCase()}</Button> : null}
      </div>
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !q.data?.length ? <p className="text-sm text-muted-foreground">No reports yet.</p> : (
        <ul className="divide-y rounded-lg border bg-card">
          {q.data.map((r) => (
            <li key={r.id}><button className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-muted/40" onClick={() => setOpenId(r.id)}>
              <span className="font-mono text-xs">{r.reference}</span><span className="font-medium">{r.title}</span>
              <Badge variant={r.status === "issued" ? "default" : "outline"}>{r.status === "issued" ? "Issued" : "Draft"}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">Updated {formatTimestamp(r.updated_at, p.timezone)}</span>
            </button></li>
          ))}
        </ul>
      )}
      {open ? <ReportDialog {...p} rec={open} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function ReportDialog(p: Props & { rec: Rec; onClose: () => void }) {
  const qc = useQueryClient();
  const { rec } = p;
  const editable = p.canContribute && !p.historicOnly;
  const init = Object.fromEntries(REPORT_FIELDS[p.module].map((f) => [f.key, String(rec.fields[f.key] ?? "")]));
  const [title, setTitle] = useState(rec.title);
  const [fields, setFields] = useState<Record<string, string>>(init);
  const [photos, setPhotos] = useState<ReportPhoto[]>(Array.isArray(rec.fields["photos"]) ? (rec.fields["photos"] as ReportPhoto[]) : []);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const dirty = title !== rec.title || JSON.stringify(fields) !== JSON.stringify(init) || JSON.stringify(photos) !== JSON.stringify(rec.fields["photos"] ?? []);

  const issues = useQuery({
    queryKey: ["tenant", p.tenantId, "project", p.projectId, "report-issues", rec.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_issues").select("id, issue_no, issued_at, file_id, file_version, note, content_hash").eq("record_id", rec.id).order("issue_no", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Issue[];
    },
  });
  const photoList = useQuery({
    queryKey: ["tenant", p.tenantId, "project", p.projectId, "report-photo-choices"],
    enabled: p.module === "progress_reports" && p.photosAvailable && editable,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_files").select("id, title, caption, current_version, project_file_versions(version_no, mime_type)").eq("project_id", p.projectId).eq("module_id", "photos").order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []).map((f) => ({ ...f, mime: (f.project_file_versions as { version_no: number; mime_type: string }[]).find((v) => v.version_no === f.current_version)?.mime_type ?? "" }))
        .filter((f) => /image\/(png|jpe?g)/.test(f.mime));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", p.tenantId, "project", p.projectId] });
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("project_records").update({ title: title.trim() || REPORT_LABEL[p.module], status: "draft", fields: { ...fields, photos } } as never)
        .eq("id", rec.id).eq("version", rec.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Report saved."); void invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const snapshot: ReportSnapshot = { module: p.module, reference: rec.reference, title: rec.title, project: p.project,
    fields: Object.fromEntries(REPORT_FIELDS[p.module].map((f) => [f.key, String(rec.fields[f.key] ?? "")])),
    photos: Array.isArray(rec.fields["photos"]) ? (rec.fields["photos"] as ReportPhoto[]) : [] };
  const problems = reportProblems(snapshot);

  const issue = useMutation({
    mutationFn: async () => {
      const hash = await sha256Hex(canonicalSnapshot(snapshot));
      if (issues.data?.[0]?.content_hash === hash) throw new Error("DUPLICATE_ISSUE");
      setStage("Building PDF…");
      const nextNo = (issues.data?.[0]?.issue_no ?? 0) + 1;
      let logo: { bytes: ArrayBuffer; mime: string } | null = null;
      if (p.brand.logoPath) {
        const dl = await supabase.storage.from(BRANDING_BUCKET).download(p.brand.logoPath);
        if (dl.data) logo = { bytes: await dl.data.arrayBuffer(), mime: dl.data.type };
      }
      const pics = [];
      for (const ph of snapshot.photos) {
        const { data: v } = await supabase.from("project_file_versions").select("storage_path, mime_type").eq("file_id", ph.fileId).eq("version_no", ph.version).maybeSingle();
        if (!v) throw new Error("A chosen photo is no longer available. Remove it and try again.");
        const dl = await supabase.storage.from(BUCKET).download(v.storage_path);
        if (!dl.data) throw new Error("A chosen photo couldn't be read. Try again.");
        pics.push({ bytes: await dl.data.arrayBuffer(), mime: v.mime_type, caption: ph.caption });
      }
      const { data: u } = await supabase.auth.getUser();
      const bytes = await buildReportPdf(snapshot, { no: nextNo, issuedAt: formatTimestamp(new Date().toISOString(), p.timezone), issuedBy: u.user?.email ?? "" }, { businessName: p.brand.businessName, colour: p.brand.colour, logo }, pics);
      const name = reportFileName(rec.reference, nextNo);
      const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
      const fileId = crypto.randomUUID();
      const path = fileStoragePath({ tenantId: p.tenantId, projectId: p.projectId, module: p.module as never, fileId, uploadId: crypto.randomUUID(), fileName: name });
      setStage("Uploading…");
      await uploadWithProgress(path, file, (pct) => setStage(`Uploading… ${pct}%`));
      setStage("Recording issue…");
      const { data: ver, error: e1 } = await supabase.rpc("record_project_file_version", { _file: fileId, _project: p.projectId, _module: p.module, _path: path, _file_name: name, _mime: "application/pdf", _size: file.size, _note: `Issue ${nextNo}`, _title: name } as never);
      if (e1) throw e1;
      const { data: no, error: e2 } = await supabase.rpc("issue_project_report", { _record: rec.id, _expected_version: rec.version, _file: fileId, _file_version: ver as number, _hash: hash, _snapshot: snapshot as never, _note: note.trim() });
      if (e2) throw e2;
      return no as number;
    },
    onSuccess: (no) => { toast.success(`Issue ${no} saved.`); setNote(""); void invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => setStage(null),
  });

  const openIssue = async (i: Issue) => {
    const { data: v } = await supabase.from("project_file_versions").select("storage_path").eq("file_id", i.file_id).eq("version_no", i.file_version).maybeSingle();
    if (!v) return toast.error("That copy isn't available to you.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.storage_path, 300);
    if (error || !data) return toast.error(friendlyError(error));
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const togglePhoto = (f: { id: string; current_version: number; caption: string; title: string }, on: boolean) =>
    setPhotos((cur) => on ? (cur.length >= MAX_REPORT_PHOTOS ? cur : [...cur, { fileId: f.id, version: f.current_version, caption: f.caption || f.title }]) : cur.filter((x) => x.fileId !== f.id));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) p.onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{rec.reference} · {REPORT_LABEL[p.module]}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div><Label htmlFor="rp-title">Title</Label><Input id="rp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} disabled={!editable} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {REPORT_FIELDS[p.module].map((f) => (
              <div key={f.key} className={f.kind === "long" ? "sm:col-span-2" : ""}>
                <Label htmlFor={`rp-${f.key}`}>{f.label}</Label>
                {f.kind === "long"
                  ? <Textarea id={`rp-${f.key}`} rows={3} maxLength={5000} value={fields[f.key]} disabled={!editable} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                  : <Input id={`rp-${f.key}`} type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "number" ? "decimal" : undefined} value={fields[f.key]} disabled={!editable} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />}
              </div>
            ))}
          </div>
          {p.module === "progress_reports" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Photos ({photos.length} of up to {MAX_REPORT_PHOTOS})</legend>
              {!p.photosAvailable ? <p className="text-xs text-muted-foreground">Switch on Photos for this project to add photos.</p>
                : !editable ? null
                : photoList.data?.length ? (
                  <div className="grid max-h-48 gap-1 overflow-y-auto rounded border p-2 sm:grid-cols-2">
                    {photoList.data.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={photos.some((x) => x.fileId === f.id)} onCheckedChange={(v) => togglePhoto(f, v === true)} />
                        <span className="truncate">{f.caption || f.title}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No JPEG or PNG photos on this project yet.</p>}
              <p className="text-xs text-muted-foreground">Each issue uses the exact photo versions chosen here.</p>
            </fieldset>
          ) : null}
          {editable ? <Button type="submit" disabled={!dirty || save.isPending}>Save draft</Button> : null}
        </form>

        <section aria-label="Issue" className="space-y-2 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Issue</h3>
          {p.canIssue && !p.historicOnly ? (
            <>
              {dirty ? <p className="text-xs text-destructive">Save your changes before issuing.</p> : null}
              {problems.map((x) => <p key={x} className="text-xs text-destructive">{x}</p>)}
              <div><Label htmlFor="rp-note">Issue note (optional)</Label><Input id="rp-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Issued to client team" /></div>
              <Button disabled={dirty || problems.length > 0 || issue.isPending} onClick={() => issue.mutate()}>{stage ?? "Issue branded PDF"}</Button>
              <p className="text-xs text-muted-foreground">Issuing saves a fixed PDF copy with the next issue number. Nothing is emailed.</p>
            </>
          ) : <p className="text-xs text-muted-foreground">Only a project admin can issue reports.</p>}
          <h4 className="pt-2 text-sm font-medium">Issue history</h4>
          {issues.error ? <p className="text-sm text-destructive">{friendlyError(issues.error)}</p> : null}
          {!issues.data?.length ? <p className="text-sm text-muted-foreground">Not issued yet.</p> : (
            <ul className="space-y-1 text-sm">
              {issues.data.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Issue {i.issue_no}</span>
                  <span className="text-muted-foreground">{formatTimestamp(i.issued_at, p.timezone)}</span>
                  {i.note ? <span className="text-muted-foreground">· {i.note}</span> : null}
                  <Button size="sm" variant="ghost" onClick={() => void openIssue(i)}>Open PDF</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {rec.fields["period_start"] ? <p className="text-xs text-muted-foreground">Period {formatDateGB(String(rec.fields["period_start"]) as DateOnly)}{rec.fields["period_end"] ? ` to ${formatDateGB(String(rec.fields["period_end"]) as DateOnly)}` : ""}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
