import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { DELAY_DISCLAIMER, ISSUE_NOTE, pdfSafe, REPORT_FIELDS, REPORT_LABEL, wrapText, type ReportSnapshot } from "@/lib/domain/reports";
import { formatDateGB, type DateOnly } from "@/lib/domain/dates";

export interface PdfBrand { businessName: string; colour: string; logo: { bytes: ArrayBuffer; mime: string } | null }
export interface PdfPhoto { bytes: ArrayBuffer; mime: string; caption: string }

const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const n = m ? parseInt(m[1]!, 16) : 0x1f5c45; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const W = 595.28, H = 841.89, M = 50;

/** Builds the issued PDF from the frozen snapshot only. */
export async function buildReportPdf(s: ReportSnapshot, issue: { no: number; issuedAt: string; issuedBy: string }, brand: PdfBrand, photos: PdfPhoto[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${s.reference} issue ${issue.no}`); doc.setAuthor(brand.businessName); doc.setCreator("Emerald Rock OS");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const colour = hex(brand.colour);
  let logo: PDFImage | null = null;
  try {
    if (brand.logo?.mime === "image/png") logo = await doc.embedPng(brand.logo.bytes);
    else if (brand.logo && /jpe?g/.test(brand.logo.mime)) logo = await doc.embedJpg(brand.logo.bytes);
  } catch { logo = null; }

  let page: PDFPage; let y = 0;
  const header = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: colour });
    if (logo) { const sc = logo.scaleToFit(120, 36); page.drawImage(logo, { x: M, y: H - 26 - sc.height, width: sc.width, height: sc.height }); }
    else page.drawText(pdfSafe(brand.businessName), { x: M, y: H - 44, size: 13, font: bold, color: colour });
    const right = pdfSafe(`${s.reference} · Issue ${issue.no}`).replace("·", "-");
    page.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 9), y: H - 40, size: 9, font });
    y = H - 80;
  };
  const ensure = (h: number) => { if (y - h < M + 30) header(); };
  const para = (text: string, f: PDFFont, size: number, c = rgb(0.1, 0.1, 0.1)) => {
    for (const line of wrapText(pdfSafe(text), W - 2 * M, (t) => f.widthOfTextAtSize(t, size))) {
      ensure(size + 4); page.drawText(line, { x: M, y, size, font: f, color: c }); y -= size + 4;
    }
  };
  header();
  para(REPORT_LABEL[s.module], bold, 18, colour); y -= 2;
  para(s.title, bold, 13);
  para(`${s.project.reference} - ${s.project.name}`, font, 10, rgb(0.35, 0.35, 0.35));
  para(`Issue ${issue.no} - issued ${issue.issuedAt} by ${issue.issuedBy}`, font, 10, rgb(0.35, 0.35, 0.35));
  y -= 8;
  if (s.module === "delay_reports") {
    const lines = wrapText(pdfSafe(DELAY_DISCLAIMER), W - 2 * M - 16, (t) => font.widthOfTextAtSize(t, 9));
    const h = lines.length * 13 + 12; ensure(h);
    page!.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, borderColor: colour, borderWidth: 1 });
    for (const l of lines) { page!.drawText(l, { x: M + 8, y: y - 2, size: 9, font }); y -= 13; }
    y -= 14;
  }
  for (const f of REPORT_FIELDS[s.module]) {
    const v = (s.fields[f.key] ?? "").trim();
    const shown = !v ? "Not stated" : f.kind === "date" ? formatDateGB(v as DateOnly) : v;
    ensure(40); para(f.label, bold, 11, colour); para(shown, font, 10); y -= 8;
  }
  if (photos.length) {
    ensure(30); para("Photos", bold, 11, colour); y -= 4;
    const colW = (W - 2 * M - 12) / 2; let col = 0; let rowH = 0;
    for (const p of photos) {
      let img: PDFImage | null = null;
      try { img = p.mime === "image/png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes); } catch { img = null; }
      if (!img) continue;
      const sc = img.scaleToFit(colW, 180);
      const capLines = wrapText(pdfSafe(p.caption || ""), colW, (t) => font.widthOfTextAtSize(t, 8)).slice(0, 3);
      const need = sc.height + capLines.length * 10 + 14;
      if (col === 0) ensure(need);
      const x = M + col * (colW + 12);
      page!.drawImage(img, { x, y: y - sc.height, width: sc.width, height: sc.height });
      capLines.forEach((l, i) => page!.drawText(l, { x, y: y - sc.height - 10 - i * 10, size: 8, font, color: rgb(0.3, 0.3, 0.3) }));
      rowH = Math.max(rowH, need);
      if (col === 1) { y -= rowH; rowH = 0; col = 0; } else col = 1;
    }
    if (col === 1) y -= rowH;
  }
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const foot = pdfSafe(`${ISSUE_NOTE}  Page ${i + 1} of ${pages.length}`);
    for (const [j, l] of wrapText(foot, W - 2 * M, (t) => font.widthOfTextAtSize(t, 7)).entries()) pg.drawText(l, { x: M, y: 30 - j * 9, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  });
  return doc.save();
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
