/** Rules for project photos and documents. Mirrors database checks for the UI. */
export type FileModuleId = "photos" | "documents" | "drawings";

export interface FileModuleAccessInput {
  businessOn: boolean;
  projectOn: boolean;
  canView: boolean;
  canContribute: boolean;
  canManage: boolean;
}

export interface FileModuleAccess {
  visible: boolean;
  canUpload: boolean;
  /** Visible only because a project admin may still look at historic files. */
  historicOnly: boolean;
}

export function fileModuleAccess(i: FileModuleAccessInput): FileModuleAccess {
  const active = i.businessOn && i.projectOn;
  if (!i.canView) return { visible: false, canUpload: false, historicOnly: false };
  if (active) return { visible: true, canUpload: i.canContribute, historicOnly: false };
  if (i.canManage) return { visible: true, canUpload: false, historicOnly: true };
  return { visible: false, canUpload: false, historicOnly: false };
}

/** Keeps letters, digits, dot, dash and underscore; never empty; max 120 chars keeping the extension. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  const base = cleaned || "file";
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
  return base.slice(0, 120 - ext.length) + ext;
}

export function fileStoragePath(p: { tenantId: string; projectId: string; module: FileModuleId; fileId: string; uploadId: string; fileName: string }): string {
  return `${p.tenantId}/${p.projectId}/${p.module}/${p.fileId}/${p.uploadId}-${safeFileName(p.fileName)}`;
}

/** Comma-separated tags: trimmed, lower case, unique, 1–40 chars. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().toLowerCase();
    if (t.length >= 1 && t.length <= 40 && !out.includes(t)) out.push(t);
  }
  return out;
}

export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim() || name;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function isImageMime(mime: string): boolean {
  return /^image\/(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(mime);
}

export function photoRejection(file: { type: string; size: number }, module: FileModuleId): string | null {
  if (file.size > MAX_FILE_BYTES) return "Larger than 50 MB";
  if (file.size === 0) return "File is empty";
  if (module === "photos" && !file.type.startsWith("image/")) return "Not an image";
  return null;
}
