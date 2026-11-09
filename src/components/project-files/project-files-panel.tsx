import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Camera, FileText, Folder, FolderPlus, History, RotateCcw, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError, StaleRecordError } from "@/lib/db-errors";
import { formatTimestamp } from "@/lib/domain/dates";
import {
  fileStoragePath, formatBytes, isImageMime, parseTags, photoRejection, titleFromFileName, type FileModuleId,
} from "@/lib/domain/project-files";
import { projectFoldersQuery } from "@/lib/project-setup-data";

const BUCKET = "project-files";
const ROOT = "__root__";

interface Props { tenantId: string; projectId: string; module: FileModuleId; canUpload: boolean; historicOnly: boolean; timezone: string; focus?: { id: string; n: number } | null }

const filesQuery = (tenantId: string, projectId: string, module: FileModuleId) => queryOptions({
  queryKey: ["tenant", tenantId, "project", projectId, "files", module],
  queryFn: async () => {
    const { data, error } = await supabase.from("project_files")
      .select("id, title, caption, tags, folder_id, current_version, updated_at, version, project_file_versions(id, version_no, storage_path, file_name, mime_type, size_bytes, note, uploaded_at)")
      .eq("project_id", projectId).eq("module_id", module).order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).map((f) => {
      const versions = [...(f.project_file_versions ?? [])].sort((a, b) => b.version_no - a.version_no);
      return { ...f, versions, current: versions[0] ?? null };
    });
    const paths = rows.map((r) => r.current?.storage_path).filter((p): p is string => !!p);
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
    return rows.map((r) => ({ ...r, url: r.current ? urls.get(r.current.storage_path) ?? null : null }));
  },
});
type FileRow = Awaited<ReturnType<NonNullable<ReturnType<typeof filesQuery>["queryFn"]>>>[number];

/** Upload with progress (the storage client has no progress callback). */
export async function uploadWithProgress(path: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const url = `${import.meta.env["VITE_SUPABASE_URL"]}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 403 || xhr.status === 400 ? "Upload refused: you may not have permission, or the module is switched off." : `Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Connection lost during upload."));
    xhr.send(file);
  });
}

interface QueueItem { key: string; file: File; status: "waiting" | "uploading" | "saving" | "done" | "failed"; pct: number; error?: string | undefined; fileId: string; existingFileId?: string | undefined }

export function ProjectFilesPanel({ tenantId, projectId, module, canUpload, historicOnly, timezone, focus }: Props) {
  const qc = useQueryClient();
  const files = useQuery(filesQuery(tenantId, projectId, module));
  const folders = useQuery(projectFoldersQuery(tenantId, projectId));
  const [folder, setFolder] = useState<string>(ROOT);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<FileRow | null>(null);
  useEffect(() => {
    const row = focus ? files.data?.find((r) => r.id === focus.id) : undefined;
    if (row) { setFolder(ROOT); setFilter(""); setOpen(row); }
  }, [focus, files.data]);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const label = module === "photos" ? "photo" : "document";

  const folderOptions = useMemo(() => {
    const rows = folders.data ?? [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const path = (r: { parent_id: string | null; name: string }): string => { const p = r.parent_id ? byId.get(r.parent_id) : undefined; return p ? `${path(p)} / ${r.name}` : r.name; };
    return rows.map((r) => ({ id: r.id, path: path(r) })).sort((a, b) => a.path.localeCompare(b.path));
  }, [folders.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tenant", tenantId, "project", projectId] });
  const patch = (key: string, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function runItem(item: QueueItem) {
    const fileId = item.existingFileId ?? item.fileId;
    const path = fileStoragePath({ tenantId, projectId, module, fileId, uploadId: crypto.randomUUID(), fileName: item.file.name });
    try {
      patch(item.key, { status: "uploading", pct: 0, error: undefined });
      await uploadWithProgress(path, item.file, (pct) => patch(item.key, { pct }));
      patch(item.key, { status: "saving", pct: 100 });
      const { error } = await supabase.rpc("record_project_file_version", {
        _file: fileId, _project: projectId, _module: module, _path: path, _file_name: item.file.name,
        _mime: item.file.type, _size: item.file.size, _note: "",
        _title: titleFromFileName(item.file.name), _caption: caption, _tags: parseTags(tags), _folder: folder === ROOT ? null : folder,
      } as never);
      if (error) throw error;
      patch(item.key, { status: "done" });
    } catch (e) {
      patch(item.key, { status: "failed", error: friendlyError(e) });
    }
  }

  async function addFiles(list: FileList | null, existingFileId?: string) {
    if (!list || list.length === 0) return;
    const items: QueueItem[] = [];
    for (const f of Array.from(list)) {
      const rej = photoRejection(f, module);
      if (rej) { toast.error(`${f.name}: ${rej}`); continue; }
      items.push({ key: crypto.randomUUID(), file: f, status: "waiting", pct: 0, fileId: crypto.randomUUID(), existingFileId });
    }
    setQueue((q) => [...items, ...q]);
    for (const it of items) await runItem(it); // one at a time keeps mobile connections stable
    invalidate();
  }

  const shown = (files.data ?? []).filter((f) => {
    if (folder !== ROOT && f.folder_id !== folder) return false;
    const q = filter.trim().toLowerCase();
    return !q || f.title.toLowerCase().includes(q) || f.caption.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q));
  });

  return (
    <div className="space-y-4">
      {historicOnly ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          This module is switched off. You can still look at earlier {label}s as a project admin, but nothing new can be added.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Label className="text-xs">Folder</Label>
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>All {label}s (uploads go to no folder)</SelectItem>
              {folderOptions.map((f) => <SelectItem key={f.id} value={f.id}>{f.path}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <Label className="text-xs" htmlFor={`${module}-filter`}>Search title, caption or tag</Label>
          <Input id={`${module}-filter`} className="mt-1" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {canUpload ? <NewFolderButton tenantId={tenantId} projectId={projectId} parentId={folder === ROOT ? null : folder} onDone={invalidate} /> : null}
      </div>

      {canUpload ? (
        <section className="rounded-lg border bg-card p-4" aria-label={`Upload ${label}s`}>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label htmlFor={`${module}-caption`} className="text-xs">Caption for this batch (optional)</Label>
              <Textarea id={`${module}-caption`} rows={2} className="mt-1" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} /></div>
            <div><Label htmlFor={`${module}-tags`} className="text-xs">Tags, separated by commas (optional)</Label>
              <Input id={`${module}-tags`} className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. roof, level 2" /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {module === "photos" ? (
              <Button type="button" onClick={() => camRef.current?.click()}><Camera className="mr-2 h-4 w-4" />Take photo</Button>
            ) : null}
            <Button type="button" variant={module === "photos" ? "outline" : "default"} onClick={() => pickRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Choose {label}s</Button>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={pickRef} type="file" multiple accept={module === "photos" ? "image/*" : undefined} className="hidden" aria-label={`Choose ${label}s`} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Up to 50 MB each. Uploads need a connection; this page does not work offline. Folder: {folder === ROOT ? "none" : folderOptions.find((f) => f.id === folder)?.path}.</p>
          {queue.length ? (
            <ul className="mt-3 space-y-2">
              {queue.map((q) => (
                <li key={q.key} className="rounded border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{q.file.name} <span className="text-muted-foreground">· {formatBytes(q.file.size)}</span></span>
                    <span className="flex items-center gap-1 text-xs">
                      {q.status === "failed" ? <Button size="sm" variant="outline" onClick={() => void runItem(q).then(invalidate)}><RotateCcw className="mr-1 h-3 w-3" />Retry</Button> : null}
                      {{ waiting: "Waiting", uploading: `${q.pct}%`, saving: "Saving", done: "Uploaded", failed: "Failed" }[q.status]}
                      {q.status === "done" || q.status === "failed" ? <button aria-label="Dismiss" onClick={() => setQueue((x) => x.filter((i) => i.key !== q.key))}><X className="h-3 w-3" /></button> : null}
                    </span>
                  </div>
                  {q.status === "uploading" ? <Progress value={q.pct} className="mt-1 h-1.5" /> : null}
                  {q.error ? <p className="mt-1 text-xs text-destructive">{q.error}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : !historicOnly ? <p className="text-sm text-muted-foreground">You can view {label}s on this project but not add them.</p> : null}

      {files.error ? <p className="text-sm text-destructive">{friendlyError(files.error)}</p> : null}
      {files.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {label}s here yet.</p>
      ) : module === "photos" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((f) => (
            <li key={f.id}>
              <button className="group block w-full overflow-hidden rounded-lg border bg-card text-left" onClick={() => setOpen(f)}>
                <div className="aspect-square bg-muted">
                  {f.url && f.current && isImageMime(f.current.mime_type) ? <img src={f.url} alt={f.caption || f.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>}
                </div>
                <div className="p-2"><p className="truncate text-sm font-medium">{f.title}</p>{f.caption ? <p className="truncate text-xs text-muted-foreground">{f.caption}</p> : null}</div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {shown.map((f) => (
            <li key={f.id}>
              <button className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50" onClick={() => setOpen(f)}>
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{f.current?.file_name} · {f.current ? formatBytes(f.current.size_bytes) : ""} · updated {formatTimestamp(f.updated_at, timezone)}</span></span>
                <Badge variant="secondary">Rev {f.current_version}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <FileDialog
          row={(files.data ?? []).find((r) => r.id === open.id) ?? open}
          folders={folderOptions} canEdit={canUpload} module={module} timezone={timezone}
          onClose={() => setOpen(null)} onSaved={invalidate}
          onNewVersion={(list) => void addFiles(list, open.id)}
        />
      ) : null}
    </div>
  );
}

function NewFolderButton({ tenantId, projectId, parentId, onDone }: { tenantId: string; projectId: string; parentId: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_folders").insert({ tenant_id: tenantId, project_id: projectId, parent_id: parentId, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Folder added"); setName(""); setOpen(false); onDone(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><FolderPlus className="mr-2 h-4 w-4" />New folder</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder{parentId ? " inside the selected folder" : ""}</DialogTitle></DialogHeader>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) m.mutate(); }} className="space-y-3">
            <Label htmlFor="new-folder">Name</Label>
            <Input id="new-folder" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Button type="submit" disabled={m.isPending || !name.trim() || /[/\\]/.test(name)}><Folder className="mr-2 h-4 w-4" />Add folder</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FileDialog({ row, folders, canEdit, module, timezone, onClose, onSaved, onNewVersion }: {
  row: FileRow; folders: { id: string; path: string }[]; canEdit: boolean; module: FileModuleId; timezone: string;
  onClose: () => void; onSaved: () => void; onNewVersion: (l: FileList | null) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [caption, setCaption] = useState(row.caption);
  const [tags, setTags] = useState(row.tags.join(", "));
  const [folder, setFolder] = useState(row.folder_id ?? ROOT);
  const verRef = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("project_files")
        .update({ title: title.trim(), caption, tags: parseTags(tags), folder_id: folder === ROOT ? null : folder })
        .eq("id", row.id).eq("version", row.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new StaleRecordError();
    },
    onSuccess: () => { toast.success("Details saved"); onSaved(); onClose(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  async function download(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) { toast.error(friendlyError(error)); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{row.title}</DialogTitle></DialogHeader>
        {row.url && row.current && isImageMime(row.current.mime_type) ? <img src={row.url} alt={row.caption || row.title} className="max-h-96 w-full rounded object-contain bg-muted" /> : null}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div><Label htmlFor="f-title">Title</Label><Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} maxLength={200} /></div>
          <div><Label htmlFor="f-caption">Caption</Label><Textarea id="f-caption" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!canEdit} maxLength={2000} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="f-tags">Tags</Label><Input id="f-tags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={!canEdit} /></div>
            <div><Label>Folder</Label>
              <Select value={folder} onValueChange={setFolder} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ROOT}>No folder</SelectItem>{folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.path}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          {canEdit ? <Button type="submit" disabled={save.isPending || !title.trim()}>Save details</Button> : null}
        </form>
        <section aria-label="Version history" className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1 text-sm font-semibold"><History className="h-4 w-4" />Version history</h3>
            {canEdit ? (<>
              <Button size="sm" variant="outline" onClick={() => verRef.current?.click()}><Upload className="mr-1 h-3 w-3" />Upload new version</Button>
              <input ref={verRef} type="file" accept={module === "photos" ? "image/*" : undefined} className="hidden" onChange={(e) => { onNewVersion(e.target.files); e.target.value = ""; onClose(); }} />
            </>) : null}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">Earlier versions are kept and cannot be changed or deleted.</p>
          <ul className="divide-y rounded border text-sm">
            {row.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0"><span className="font-medium">Version {v.version_no}</span>{v.version_no === row.current_version ? <Badge className="ml-2" variant="secondary">Current</Badge> : null}
                  <span className="block truncate text-xs text-muted-foreground">{v.file_name} · {formatBytes(v.size_bytes)} · {formatTimestamp(v.uploaded_at, timezone)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => void download(v.storage_path)}>Open</Button>
              </li>
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
