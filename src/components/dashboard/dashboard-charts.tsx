import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { formatDateGB } from "@/lib/domain/dates";
import { openClosedByModule, segmentRecords, weeklyTrend, type DashboardRecord, type Period, type Segment } from "@/lib/domain/dashboard";
import type { DashModule } from "./live-dashboard";

interface Props { records: DashboardRecord[]; modules: DashModule[]; period: Period; onOpenModule: (id: string) => void }
const OPEN = "var(--primary)";
const CLOSED = "var(--muted-foreground)";
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

export function DashboardCharts({ records, modules, period, onOpenModule }: Props) {
  const [seg, setSeg] = useState<Segment | null>(null);
  const ids = modules.map((m) => m.id);
  const label = (id: string) => modules.find((m) => m.id === id)?.label ?? id;
  const oc = openClosedByModule(records, ids).map((r) => ({ ...r, name: label(r.module_id) }));
  const trend = weeklyTrend(records, ids, period).map((w) => ({ ...w, name: formatDateGB(w.week).slice(0, 5) }));
  const picked = seg ? segmentRecords(records, ids, period, seg) : [];
  const segTitle = !seg ? "" : seg.kind === "status"
    ? `${label(seg.module_id)} · ${seg.closed ? "closed" : "open"}`
    : `${seg.series === "raised" ? "Raised" : "Closed"} in week of ${formatDateGB(seg.week)}`;
  if (modules.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4" aria-label="Open versus closed by register">
          <h2 className="text-sm font-semibold">Open versus closed</h2>
          <p className="mb-2 text-xs text-muted-foreground">All records to date. Click a bar to list its records.</p>
          <div style={{ height: Math.max(200, oc.length * 28 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={oc} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} tick={axis} />
                <YAxis type="category" dataKey="name" width={110} tick={axis} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="open" name="Open" stackId="a" fill={OPEN} cursor="pointer" onClick={(d: { module_id: string }) => setSeg({ kind: "status", module_id: d.module_id, closed: false })} />
                <Bar dataKey="closed" name="Closed" stackId="a" fill={CLOSED} cursor="pointer" onClick={(d: { module_id: string }) => setSeg({ kind: "status", module_id: d.module_id, closed: true })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-lg border bg-card p-4" aria-label="Weekly raised and closed">
          <h2 className="text-sm font-semibold">Weekly trend</h2>
          <p className="mb-2 text-xs text-muted-foreground">Raised and closed per week (weeks start Monday) within the chosen period. Click a bar to list its records.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ right: 12 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} width={28} />
                <Tooltip labelFormatter={(_, p) => (p?.[0] ? `Week of ${formatDateGB((p[0].payload as { week: string }).week)}` : "")} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="raised" name="Raised" fill={OPEN} cursor="pointer" onClick={(d: { week: string }) => setSeg({ kind: "week", week: d.week, series: "raised" })} />
                <Bar dataKey="closed" name="Closed" fill={CLOSED} cursor="pointer" onClick={(d: { week: string }) => setSeg({ kind: "week", week: d.week, series: "closed" })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      {/* Accessible equivalent of the bars: same numbers, keyboard reachable. */}
      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show chart figures as a table</summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Register</th><th>Open</th><th>Closed</th></tr></thead>
          <tbody>{oc.map((r) => (
            <tr key={r.module_id} className="border-t"><td className="py-1">{r.name}</td>
              <td><button type="button" className="underline" onClick={() => setSeg({ kind: "status", module_id: r.module_id, closed: false })}>{r.open}</button></td>
              <td><button type="button" className="underline" onClick={() => setSeg({ kind: "status", module_id: r.module_id, closed: true })}>{r.closed}</button></td></tr>
          ))}</tbody>
        </table>
      </details>
      {seg ? (
        <section className="rounded-lg border bg-card p-4" aria-label="Records behind the chart">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{segTitle} <span className="font-normal text-muted-foreground">({picked.length})</span></h2>
            <Button size="sm" variant="ghost" onClick={() => setSeg(null)}>Clear</Button>
          </div>
          {picked.length === 0 ? <p className="text-sm text-muted-foreground">No records in this segment.</p> : (
            <ul className="divide-y text-sm">
              {picked.slice(0, 50).map((r) => (
                <li key={r.id}>
                  <button type="button" className="flex w-full gap-2 py-2 text-left hover:bg-muted/50" onClick={() => onOpenModule(r.module_id)}>
                    <span className="font-mono text-xs">{r.reference}</span><span className="flex-1">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{label(r.module_id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
