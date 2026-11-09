import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanFindings, comparableMime, FINDING_CATEGORIES } from "@/lib/domain/comparison";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_COMPARE_BYTES = 20 * 1024 * 1024;
const MODEL = "openai/gpt-6-astra";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const compareDrawingRevisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { recordId: string; fromRevisionId: string; toRevisionId: string }) => {
    if (![d.recordId, d.fromRevisionId, d.toRevisionId].every((x) => UUID.test(x))) throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: ok } = await sb.rpc("can_compare_drawing", { _record: data.recordId, _from: data.fromRevisionId, _to: data.toRevisionId });
    if (!ok) throw new Error("NOT_ALLOWED: you can't compare these revisions");

    // Read the two revisions and their files as the signed-in user (row and storage rules apply).
    const { data: revs, error } = await sb.from("drawing_revisions").select("id, revision, file_id, file_version").in("id", [data.fromRevisionId, data.toRevisionId]);
    if (error || !revs || revs.length !== 2) throw new Error("NOT_FOUND: revisions not available");
    const ordered = [revs.find((r) => r.id === data.fromRevisionId)!, revs.find((r) => r.id === data.toRevisionId)!];
    const parts: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" } | { type: "input_file"; file_data: string; filename: string }> = [];
    for (const [i, r] of ordered.entries()) {
      const { data: v } = await sb.from("project_file_versions").select("storage_path, mime_type, size_bytes, file_name").eq("file_id", r.file_id).eq("version_no", r.file_version).maybeSingle();
      if (!v) throw new Error("NOT_FOUND: file not available");
      const kind = comparableMime(v.mime_type);
      if (!kind) throw new Error(`UNSUPPORTED_FILE: revision ${r.revision} must be a PDF or image to compare`);
      if (v.size_bytes > MAX_COMPARE_BYTES) throw new Error(`FILE_TOO_LARGE: revision ${r.revision} is over 20 MB`);
      const dl = await sb.storage.from("project-files").download(v.storage_path);
      if (dl.error || !dl.data) throw new Error("NOT_FOUND: file not available");
      const b64 = toBase64(await dl.data.arrayBuffer());
      parts.push({ type: "input_text", text: `${i === 0 ? "EARLIER" : "LATER"} revision ${r.revision}:` });
      parts.push(kind === "image"
        ? { type: "input_image", image_url: `data:${v.mime_type};base64,${b64}`, detail: "high" }
        : { type: "input_file", file_data: `data:application/pdf;base64,${b64}`, filename: v.file_name });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const save = async (status: "completed" | "failed", err: string | null, findings: unknown[]) => {
      const { data: row, error: e } = await supabaseAdmin.rpc("save_drawing_comparison", {
        _actor: context.userId, _record: data.recordId, _from: data.fromRevisionId, _to: data.toRevisionId,
        _status: status, _error: err ?? "", _model: MODEL, _findings: findings as never,
      });
      if (e) throw e;
      return (row as { comparison_id: string; finding_count: number; new_count: number }[])[0]!;
    };

    let text = "";
    try {
      const { generateResponse } = await import("@lovable.dev/ai-gateway");
      const res = await generateResponse({
        model: MODEL,
        instructions:
          "You compare two revisions of the same construction drawing. List only differences you can actually see between the EARLIER and LATER revision: added, removed or moved elements, changed dimensions, annotations or specification notes. Give a short location (grid, room, level, detail or title block area) and one plain British English sentence per difference. Do not guess, do not assess cost, time, entitlement or responsibility, and do not describe anything that is the same. If you cannot read the drawings or see no differences, return an empty list.",
        input: [{ role: "user", content: [...parts, { type: "input_text", text: "Return the differences as JSON." }] as never }],
        text: { format: { type: "json_schema", name: "drawing_differences", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["findings"],
          properties: { findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["category", "location", "summary"],
            properties: { category: { type: "string", enum: [...FINDING_CATEGORIES] }, location: { type: "string" }, summary: { type: "string" } } } } },
        } } },
      });
      for (const item of (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [])
        for (const c of item.content ?? []) if (c.type === "output_text" && c.text) text += c.text;
    } catch (e) {
      console.error("drawing comparison failed", e);
      await save("failed", "The AI service could not complete the comparison.", []);
      throw new Error("AI_FAILED: the comparison could not be completed. No findings were recorded; you can try again.");
    }
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (parsed === null) {
      await save("failed", "The AI response could not be read.", []);
      throw new Error("AI_FAILED: the AI response could not be read. No findings were recorded; you can try again.");
    }
    const { findings, dropped } = cleanFindings(parsed);
    const row = await save("completed", null, findings);
    return { comparisonId: row.comparison_id, found: row.finding_count, added: row.new_count, dropped };
  });
