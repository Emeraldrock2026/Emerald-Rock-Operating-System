import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/lib/use-tenant";
import { availableExports, exportFileName, type ExportKind } from "@/lib/domain/exports";
import { addDays, isDateOnly, todayIn, type DateOnly } from "@/lib/domain/dates";
import { buildExport, downloadCsv } from "@/lib/exports";
import { friendlyError } from "@/lib/db-errors";

export const Route = createFileRoute("/_authenticated/t/$tenantId/exports")({
  head: () => ({
    meta: [
      { title: "Exports — Emerald Rock OS" },
      { name: "description", content: "Download CSV files of the records you can see." },
      { property: "og:title", content: "Exports — Emerald Rock OS" },
      { property: "og:description", content: "Download CSV files of the records you can see." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportsPage,
});

function ExportsPage() {
  const { ctx, tenantId } = useTenant();
  const tenant = ctx.tenant!;
  const today = todayIn(tenant.timezone);
  const [from, setFrom] = useState<DateOnly>(today.slice(0, 8) + "01");
  const [to, setTo] = useState<DateOnly>(addDays(today, 28));
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const defs = availableExports(ctx.access);

  async function run(kind: ExportKind) {
    if (kind === "allocations" && (!isDateOnly(from) || !isDateOnly(to) || from > to)) {
      toast.error("Choose a valid date range: the start must be on or before the end.");
      return;
    }
    setBusy(kind);
    try {
      const csv = await buildExport(tenantId, kind, { from, to });
      downloadCsv(csv, exportFileName(tenant.displayName, kind, today));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Exports" description="CSV files open in Excel. They contain only what you're allowed to see in this business." />
      {defs.length === 0 ? (
        <p className="text-sm text-muted-foreground">There's nothing for you to export in this business.</p>
      ) : (
        <ul className="space-y-3">
          {defs.map((d) => (
            <li key={d.kind} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.kind === "allocations" && ctx.access?.role === "employee" ? "My allocations" : d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                </div>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(d.kind)}>
                  <Download className="size-4" aria-hidden /> {busy === d.kind ? "Preparing…" : "Download CSV"}
                </Button>
              </div>
              {d.kind === "allocations" ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="exp-from" className="text-xs">From</Label>
                    <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-to" className="text-xs">To</Label>
                    <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Dates are DD/MM/YYYY; amounts are in pounds without the £ sign so spreadsheets can total them.</p>
    </div>
  );
}
