import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Settings2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatDateGB, todayIn } from "@/lib/domain/dates";
import {
  authorisationNote, DEFAULT_SCHEME, describeScheme, latestRevision, nextRevision, parseScheme, revisionProblem, type RevisionScheme,
} from "@/lib/domain/drawings";
import { fileStoragePath, photoRejection } from "@/lib/domain/project-files";
import { uploadWithProgress } from "@/components/project-files/project-files-panel";

interface Props { tenantId: string; projectId: string; timezone: string; canContribute: boolean; canManage: boolean; historicOnly: boolean }

const key = (t: string, p: string) => ["tenant", t, "project", p, "drawings"] as const;

const registerQuery = (tenantId: string, projectId: string) => queryOptions({
  queryKey: key(tenantId, projectId),
  queryFn: async () => {
    const [recs, revs, settings] = await Promise.all([
      supabase.from("project_records").select("id, reference, title, fields, status").eq("project_id", projectId).eq("module_id", "drawings"),
      supabase.from("drawing_revisions").select("id, record_id, revision, rank, revision_date, received_on, purpose, note, file_id, file_version, authorised, authorised_at").eq("project_id", projectId),
      supabase.from("drawing_register_settings").select("series, digits, version").eq("project_id", projectId).maybeSingle(),
    ]);
    if (recs.error) throw recs.error;
    if (revs.error) throw revs.error;
    if (settings.error) throw settings.error;
    const scheme: RevisionScheme = settings.data ? { series: settings.data.series, digits: settings.data.digits } : DEFAULT_SCHEME;
    const drawings = (recs.data ?? []).map((r) => {
      const f = (r.fields ?? {}) as { number?: string; discipline?: string };
      const revisions = (revs.data ?? []).filter((v) => v.record_id === r.id).sort((a, b) => a.rank - b.rank);
      return {
        id: r.id, reference: r.reference, title: r.title, number: f.number ?? "", discipline: f.discipline ?? "",
        revisions, latest: revisions.at(-1) ?? null, authorised: revisions.find((v) => v.authorised) ?? null,
      };
    }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    return { drawings, scheme, settingsVersion: settings.data?.version ?? null };
  },
});
type Drawing = Awaited<ReturnType<NonNullable<ReturnType<typeof registerQuery>["queryFn"]>>>["drawings"][number];

export function DrawingRegister(props: Props) {
  const { tenantId, projectId, canContribute, canManage, historicOnly } = props;
  const q = useQuery(registerQuery(tenantId, projectId));
  const [adding, setAdding] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discipline, setDiscipline] = useState("all");
  const drawings = q.data?.drawings ?? [];
  const disciplines = [...new Set(drawings.map((d) => d.discipline).filter(Boolean))].sort();
  const shown = discipline === "all" ? drawings : drawings.filter((d) => d.discipline === discipline);
  const dates = useMemo(() => [...new Set(shown.flatMap((d) => d.revisions.map((r) => r.revision_date)))].sort(), [shown]);
  const open = drawings.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-4">
      {historicOnly ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">The Drawings module is switched off. You can look at the register as a project admin, but nothing new can be added or authorised.</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        {disciplines.length ? (
          <div className="min-w-44"><Label className="text-xs">Discipline</Label>
            <Select value={discipline} onValueChange={setDiscipline}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All disciplines</SelectItem>{disciplines.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
        ) : null}
        <div className="flex-1" />
        {canContribute ? <Button variant="outline" onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Add drawing</Button> : null}
        {canContribute && drawings.length ? <Button onClick={() => setUploadFor(null)}><Upload className="mr-2 h-4 w-4" />Upload new revision</Button> : null}
        {canManage && !historicOnly ? <Button variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Revision sequence</Button> : null}
      </div>
      {q.data ? <p className="text-xs text-muted-foreground">Revision sequence: {describeScheme(q.data.scheme)}. Uploading a revision never authorises it; a project admin authorises for use separately.</p> : null}
      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}

      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? <p className="text-sm text-muted-foreground">No drawings yet.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-28 border-b bg-card p-2">Number</th>
                <th className="sticky left-28 z-10 min-w-48 border-b bg-card p-2">Title</th>
                <th className="sticky left-76 z-10 min-w-24 border-b bg-card p-2">Latest received</th>
                <th className="sticky left-100 z-10 min-w-28 border-b border-r bg-card p-2">Authorised for use</th>
                {dates.map((d) => <th key={d} className="min-w-20 whitespace-nowrap border-b p-2 text-center font-normal">{formatDateGB(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="hover:bg-muted/40">
                  <td className="sticky left-0 z-10 border-b bg-card p-2 font-mono text-xs"><button className="underline-offset-2 hover:underline" onClick={() => setOpenId(d.id)}>{d.number}</button></td>
                  <td className="sticky left-28 z-10 max-w-48 truncate border-b bg-card p-2" title={d.title}>{d.title}</td>
                  <td className="sticky left-76 z-10 border-b bg-card p-2 font-medium">{d.latest?.revision ?? "—"}</td>
                  <td className="sticky left-100 z-10 border-b border-r bg-card p-2">
                    {d.authorised ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />{d.authorised.revision}</span> : <span className="text-muted-foreground">None</span>}
                    {d.latest && d.authorised && d.latest.id !== d.authorised.id ? <span className="ml-1 text-xs text-muted-foreground">(older)</span> : null}
                  </td>
                  {dates.map((date) => {
                    const here = d.revisions.filter((r) => r.revision_date === date);
                    return (
                      <td key={date} className="border-b p-2 text-center">
                        {here.map((r) => <span key={r.id} className={r.authorised ? "rounded bg-primary/10 px-1 font-semibold text-primary" : ""} title={r.authorised ? "Authorised for use" : "Received"}>{r.revision} </span>)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? <AddDrawingDialog {...props} onClose={() => setAdding(false)} /> : null}
      {uploadFor !== undefined && q.data ? <UploadRevisionDialog {...props} drawings={drawings} scheme={q.data.scheme} initialId={uploadFor} onClose={() => setUploadFor(undefined)} /> : null}
      {open ? <DrawingDialog {...props} drawing={open} onClose={() => setOpenId(null)} onUpload={() => { setOpenId(null); setUploadFor(open.id); }} /> : null}
      {settingsOpen && q.data ? <SchemeDialog {...props} scheme={q.data.scheme} version={q.data.settingsVersion} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

function useInvalidate(tenantId: string, projectId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] });
}

function AddDrawingDialog({ tenantId, projectId, onClose }: Props & { onClose: () => void }) {
  const inv = useInvalidate(tenantId, projectId);
  const [number, setNumber] = useState(""); const [title, setTitle] = useState(""); const [discipline, setDiscipline] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_records").insert({
        tenant_id: tenantId, project_id: projectId, module_id: "drawings", title: title.trim(), status: "active",
        fields: { number: number.trim(), discipline: discipline.trim() },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Drawing added"); inv(); onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add drawing</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
          <div><Label htmlFor="d-number">Drawing number</Label><Input id="d-number" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={80} required /></div>
          <div><Label htmlFor="d-title">Title</Label><Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required /></div>
          <div><Label htmlFor="d-disc">Discipline (optional)</Label><Input id="d-disc" value={discipline} onChange={(e) => setDiscipline(e.target.value)} maxLength={60} placeholder="e.g. Architectural" /></div>
          <Button type="submit" disabled={m.isPending || !number.trim() || !title.trim()}>Add drawing</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadRevisionDialog({ tenantId, projectId, timezone, drawings, scheme, initialId, onClose }: Props & { drawings: Drawing[]; scheme: RevisionScheme; initialId: string | null; onClose: () => void }) {
  const inv = useInvalidate(tenantId, projectId);
  const [drawingId, setDrawingId] = useState(initialId ?? drawings[0]?.id ?? "");
  const d = drawings.find((x) => x.id === drawingId);
  const existing = d?.revisions.map((r) => r.revision) ?? [];
  const latest = latestRevision(existing, scheme);
  const [revision, setRevision] = useState(nextRevision(latest, scheme));
  const [date, setDate] = useState(todayIn(timezone));
  const [purpose, setPurpose] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const problem = d ? revisionProblem(revision, existing, scheme) : "Choose a drawing.";
  const fileProblem = file ? photoRejection(file, "documents") : "Choose the drawing file.";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!d || !file || problem || fileProblem) return;
    setErr(null);
    try {
      const fileId = d.latest?.file_id ?? crypto.randomUUID();
      const path = fileStoragePath({ tenantId, projectId, module: "drawings", fileId, uploadId: crypto.randomUUID(), fileName: file.name });
      setPct(0);
      await uploadWithProgress(path, file, setPct);
      const v = await supabase.rpc("record_project_file_version", {
        _file: fileId, _project: projectId, _module: "drawings", _path: path, _file_name: file.name, _mime: file.type, _size: file.size,
        _note: `Revision ${revision}`, _title: `${d.number} ${d.title}`, _caption: "", _tags: [], _folder: null,
      } as never);
      if (v.error) throw v.error;
      const r = await supabase.rpc("add_drawing_revision", { _record: d.id, _revision: revision, _revision_date: date, _file: fileId, _file_version: v.data as number, _purpose: purpose });
      if (r.error) throw r.error;
      toast.success(`Revision ${revision.toUpperCase()} recorded as received. It is not authorised for use until a project admin authorises it.`);
      inv(); onClose();
    } catch (x) { setErr(friendlyError(x)); setPct(null); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && pct === null) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload new revision</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => void submit(e)}>
          <div><Label>Drawing</Label>
            <Select value={drawingId} onValueChange={(v) => { setDrawingId(v); const dd = drawings.find((x) => x.id === v); setRevision(nextRevision(latestRevision(dd?.revisions.map((r) => r.revision) ?? [], scheme), scheme)); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{drawings.map((x) => <SelectItem key={x.id} value={x.id}>{x.number} · {x.title}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Latest received: {latest ?? "none"} · Authorised for use: {d?.authorised?.revision ?? "none"}</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="r-code">Revision</Label><Input id="r-code" value={revision} onChange={(e) => setRevision(e.target.value.toUpperCase())} />
              {scheme.series.length > 1 ? (
                <div className="mt-1 flex flex-wrap gap-1">{scheme.series.map((s, i) => <Button key={s} type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setRevision(nextRevision(latest, scheme, i))}>Next {s}</Button>)}</div>
              ) : null}</div>
            <div><Label htmlFor="r-date">Revision date</Label><Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          </div>
          <div><Label htmlFor="r-purpose">Purpose or status (optional)</Label><Input id="r-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={120} placeholder="e.g. For comment" /></div>
          <div><Label htmlFor="r-file">File</Label><Input id="r-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          {file && fileProblem ? <p className="text-sm text-destructive">{fileProblem}</p> : null}
          {pct !== null ? <Progress value={pct} className="h-1.5" /> : null}
          {err ? <p className="text-sm text-destructive">{err} You can try again.</p> : null}
          <Button type="submit" disabled={!!problem || !!fileProblem || pct !== null}>Upload revision</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DrawingDialog({ tenantId, projectId, canContribute, canManage, historicOnly, drawing, onClose, onUpload }: Props & { drawing: Drawing; onClose: () => void; onUpload: () => void }) {
  const inv = useInvalidate(tenantId, projectId);
  const auth = useMutation({
    mutationFn: async (v: { id: string; on: boolean }) => {
      const { error } = await supabase.rpc("set_drawing_authorised", { _revision: v.id, _authorised: v.on });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Authorisation updated"); inv(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  async function openFile(fileId: string, version: number) {
    const { data, error } = await supabase.from("project_file_versions").select("storage_path").eq("file_id", fileId).eq("version_no", version).maybeSingle();
    if (error || !data) { toast.error(friendlyError(error)); return; }
    const s = await supabase.storage.from("project-files").createSignedUrl(data.storage_path, 300);
    if (s.error || !s.data) { toast.error(friendlyError(s.error)); return; }
    window.open(s.data.signedUrl, "_blank", "noopener");
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{drawing.number} · {drawing.title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{drawing.reference}{drawing.discipline ? ` · ${drawing.discipline}` : ""}</p>
        <p className="text-sm">{authorisationNote(drawing.latest?.revision ?? null, drawing.authorised?.revision ?? null)}</p>
        {canContribute ? <Button size="sm" className="w-fit" onClick={onUpload}><Upload className="mr-2 h-4 w-4" />Upload new revision</Button> : null}
        <ul className="divide-y rounded border text-sm">
          {[...drawing.revisions].reverse().map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-2">
              <span className="w-12 font-semibold">{r.revision}</span>
              <span className="flex-1 text-xs text-muted-foreground">Dated {formatDateGB(r.revision_date)} · received {formatDateGB(r.received_on)}{r.purpose ? ` · ${r.purpose}` : ""}</span>
              {r.id === drawing.latest?.id ? <Badge variant="secondary">Latest received</Badge> : null}
              {r.authorised ? <Badge>Authorised for use</Badge> : null}
              <Button size="sm" variant="ghost" onClick={() => void openFile(r.file_id, r.file_version)}>Open</Button>
              {canManage && !historicOnly ? (
                <Button size="sm" variant="outline" disabled={auth.isPending} onClick={() => auth.mutate({ id: r.id, on: !r.authorised })}>{r.authorised ? "Withdraw authorisation" : "Authorise for use"}</Button>
              ) : null}
            </li>
          ))}
          {drawing.revisions.length === 0 ? <li className="p-2 text-muted-foreground">No revisions received yet.</li> : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function SchemeDialog({ tenantId, projectId, scheme, version, onClose }: Props & { scheme: RevisionScheme; version: number | null; onClose: () => void }) {
  const inv = useInvalidate(tenantId, projectId);
  const [series, setSeries] = useState(scheme.series.join(", "));
  const [digits, setDigits] = useState(String(scheme.digits));
  const parsed = parseScheme(series, Number(digits));
  const m = useMutation({
    mutationFn: async () => {
      if (typeof parsed === "string") throw new Error(parsed);
      if (version === null) {
        const { error } = await supabase.from("drawing_register_settings").insert({ tenant_id: tenantId, project_id: projectId, series: parsed.series, digits: parsed.digits });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("drawing_register_settings").update({ series: parsed.series, digits: parsed.digits }).eq("project_id", projectId).eq("version", version).select("project_id");
        if (error) throw error;
        if (!data?.length) throw new StaleRecordError();
      }
    },
    onSuccess: () => { toast.success("Revision sequence saved"); inv(); onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revision sequence</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div><Label htmlFor="s-series">Series, in order</Label><Input id="s-series" value={series} onChange={(e) => setSeries(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Letters for each stage, e.g. "P, C" for preliminary then construction. Use "A-Z" for single-letter revisions.</p></div>
          <div><Label htmlFor="s-digits">Digits</Label><Input id="s-digits" type="number" min={1} max={3} value={digits} onChange={(e) => setDigits(e.target.value)} /></div>
          {typeof parsed === "string" ? <p className="text-sm text-destructive">{parsed}</p> : <p className="text-xs text-muted-foreground">Sequence: {describeScheme(parsed)}</p>}
          <p className="text-xs text-muted-foreground">Existing revisions keep their codes. New revisions must follow this sequence and come after the latest.</p>
          <Button type="submit" disabled={typeof parsed === "string" || m.isPending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
