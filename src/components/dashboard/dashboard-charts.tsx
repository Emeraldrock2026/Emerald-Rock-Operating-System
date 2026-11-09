import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { formatDateGB, type DateOnly } from "@/lib/domain/dates";
import {
  AGE_BUCKETS, ageingCounts, openClosedByModule, QA_RESULTS, qaResultCounts, recordSegment, weeklyEventCounts, weeklyTrend,
  type DashboardRecord, type DashEvent, type Period, type RecordSegment,
} from "@/lib/domain/dashboard";
import type { DashModule } from "./live-dashboard";

interface Props {
  records: DashboardRecord[]; photos: DashEvent[] | null; reports: DashEvent[] | null;
  modules: DashModule[]; period: Period; today: DateOnly; onOpenRecord: (module: string, id: string) => void;
}
interface Item { key: string; module_id: string; target_id: string; reference: string; label: string }
interface Picked { title: string; items: Item[] }

export const PAGE = 50;
const PRIMARY = "var(--primary)";
const MUTED = "var(--muted-foreground)";
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = { background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)", fontSize: 12 };
const QA_LABEL = { open: "Open", passed: "Passed", failed: "Failed", closed: "Closed" } as const;
const QA_FILL = { open: MUTED, passed: "var(--success)", failed: "var(--destructive)", closed: "var(--border)" } as const;
const weekName = (w: string) => formatDateGB(w as DateOnly).slice(0, 5);

function Card({ label, title, hint, children, height = 240 }: { label: string; title: string; hint: string; children: ReactNode; height?: number }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={label}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children as never}</ResponsiveContainer></div>
    </section>
  );
}

export function DashboardCharts({ records, photos, reports, modules, period, today, onOpenRecord }: Props) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const ids = modules.map((m) => m.id);
  const label = (id: string) => modules.find((m) => m.id === id)?.label ?? (id === "photos" ? "Photos" : id);
  const fromRecords = (title: string, seg: RecordSegment) => {
    setLimit(PAGE);
    setPicked({ title, items: recordSegment(records, ids, period, today, seg).map((r) => ({ key: r.id, module_id: r.module_id, target_id: r.id, reference: r.reference, label: r.title })) });
  };
  const fromEvents = (title: string, events: DashEvent[], week: string) => {
    setLimit(PAGE);
    setPicked({ title, items: events.filter((e) => e.on >= period.from && e.on <= period.to && e.on >= week && e.on <= addSix(week))
      .map((e) => ({ key: e.id, module_id: e.module_id, target_id: e.target_id, reference: formatDateGB(e.on), label: e.label })) });
  };

  const oc = openClosedByModule(records, ids).map((r) => ({ ...r, name: label(r.module_id) }));
  const trend = weeklyTrend(records, ids, period).map((w) => ({ ...w, name: weekName(w.week) }));
  const ages = ageingCounts(records, ids, today);
  const ageData = AGE_BUCKETS.map((b) => ({ bucket: b.id, name: b.label, count: ages[b.id] }));
  const qaOn = ids.includes("qa");
  const qa = qaResultCounts(records);
  const qaData = QA_RESULTS.map((s) => ({ status: s, name: QA_LABEL[s], count: qa[s] }));
  const photoData = photos ? weeklyEventCounts(photos, period).map((w) => ({ ...w, name: weekName(w.week) })) : null;
  const reportData = reports ? weeklyEventCounts(reports, period).map((w) => ({ ...w, name: weekName(w.week) })) : null;
  if (modules.length === 0 && !photos) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {modules.length ? (
          <Card label="Open versus closed by register" title="Open versus closed" hint="All records to date. Click a bar to list its records." height={Math.max(200, oc.length * 28 + 60)}>
            <BarChart data={oc} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={axis} />
              <YAxis type="category" dataKey="name" width={110} tick={axis} />
              <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="open" name="Open" stackId="a" fill={PRIMARY} cursor="pointer" onClick={(d: { module_id: string }) => fromRecords(`${label(d.module_id)} · open`, { kind: "status", module_id: d.module_id, closed: false })} />
              <Bar dataKey="closed" name="Closed" stackId="a" fill={MUTED} cursor="pointer" onClick={(d: { module_id: string }) => fromRecords(`${label(d.module_id)} · closed`, { kind: "status", module_id: d.module_id, closed: true })} />
            </BarChart>
          </Card>
        ) : null}
        {modules.length ? (
          <Card label="Weekly raised and closed" title="Weekly trend" hint="Raised and closed per week (weeks start Monday) within the chosen period.">
            <BarChart data={trend} margin={{ right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={28} />
              <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="raised" name="Raised" fill={PRIMARY} cursor="pointer" onClick={(d: { week: DateOnly }) => fromRecords(`Raised in week of ${formatDateGB(d.week)}`, { kind: "week", week: d.week, series: "raised" })} />
              <Bar dataKey="closed" name="Closed" fill={MUTED} cursor="pointer" onClick={(d: { week: DateOnly }) => fromRecords(`Closed in week of ${formatDateGB(d.week)}`, { kind: "week", week: d.week, series: "closed" })} />
            </BarChart>
          </Card>
        ) : null}
        {modules.length ? (
          <Card label="Ageing of open items" title="Ageing of open items" hint="Open items by days since they were raised, as of today.">
            <BarChart data={ageData} margin={{ right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={28} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" name="Open items" fill={PRIMARY} cursor="pointer" onClick={(d: { bucket: (typeof AGE_BUCKETS)[number]["id"]; name: string }) => fromRecords(`Open for ${d.name}`, { kind: "age", bucket: d.bucket })} />
            </BarChart>
          </Card>
        ) : null}
        {qaOn ? (
          <Card label="QA results" title="QA inspections by result" hint="Current status of every inspection. Closed is shown separately because closing does not itself record a pass or fail.">
            <BarChart data={qaData} margin={{ right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={28} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" name="Inspections" cursor="pointer" fill={MUTED}
                shape={(props: unknown) => { const p = props as { x: number; y: number; width: number; height: number; payload: { status: keyof typeof QA_FILL } }; return <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={QA_FILL[p.payload.status]} />; }}
                onClick={(d: { status: (typeof QA_RESULTS)[number]; name: string }) => fromRecords(`QA · ${d.name}`, { kind: "qa", status: d.status })} />
            </BarChart>
          </Card>
        ) : null}
        {photoData && photos ? (
          <Card label="Photos uploaded per week" title="Photos uploaded" hint="Photos added per week within the chosen period.">
            <BarChart data={photoData} margin={{ right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={28} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" name="Photos" fill={PRIMARY} cursor="pointer" onClick={(d: { week: DateOnly }) => fromEvents(`Photos added in week of ${formatDateGB(d.week)}`, photos, d.week)} />
            </BarChart>
          </Card>
        ) : null}
        {reportData && reports ? (
          <Card label="Reports issued per week" title="Reports issued" hint="Progress and delay report issues per week within the chosen period.">
            <BarChart data={reportData} margin={{ right: 12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={axis} /><YAxis allowDecimals={false} tick={axis} width={28} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="count" name="Issues" fill={PRIMARY} cursor="pointer" onClick={(d: { week: DateOnly }) => fromEvents(`Reports issued in week of ${formatDateGB(d.week)}`, reports, d.week)} />
            </BarChart>
          </Card>
        ) : null}
      </div>

      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show chart figures as a table</summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Register</th><th>Open</th><th>Closed</th></tr></thead>
          <tbody>{oc.map((r) => (
            <tr key={r.module_id} className="border-t"><td className="py-1">{r.name}</td>
              <td><button type="button" className="underline" onClick={() => fromRecords(`${r.name} · open`, { kind: "status", module_id: r.module_id, closed: false })}>{r.open}</button></td>
              <td><button type="button" className="underline" onClick={() => fromRecords(`${r.name} · closed`, { kind: "status", module_id: r.module_id, closed: true })}>{r.closed}</button></td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-xs">Ageing: {ageData.map((a) => (
          <button key={a.bucket} type="button" className="mr-3 underline" onClick={() => fromRecords(`Open for ${a.name}`, { kind: "age", bucket: a.bucket })}>{a.name} {a.count}</button>
        ))}</p>
        {qaOn ? <p className="mt-1 text-xs">QA: {qaData.map((a) => (
          <button key={a.status} type="button" className="mr-3 underline" onClick={() => fromRecords(`QA · ${a.name}`, { kind: "qa", status: a.status })}>{a.name} {a.count}</button>
        ))}</p> : null}
      </details>

      {picked ? (
        <section className="rounded-lg border bg-card p-4" aria-label="Records behind the chart">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{picked.title} <span className="font-normal text-muted-foreground">({picked.items.length})</span></h2>
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Clear</Button>
          </div>
          {picked.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in this segment.</p> : (
            <>
              <ul className="divide-y text-sm">
                {picked.items.slice(0, limit).map((r) => (
                  <li key={r.key}>
                    <button type="button" className="flex w-full gap-2 py-2 text-left hover:bg-muted/50" onClick={() => onOpenRecord(r.module_id, r.target_id)}>
                      <span className="font-mono text-xs">{r.reference}</span><span className="flex-1">{r.label}</span>
                      <span className="text-xs text-muted-foreground">{label(r.module_id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Showing {Math.min(limit, picked.items.length)} of {picked.items.length}</span>
                {limit < picked.items.length ? <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, picked.items.length - limit)} more</Button> : null}
                {limit < picked.items.length ? <Button size="sm" variant="ghost" onClick={() => setLimit(picked.items.length)}>Show all</Button> : null}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function addSix(week: string): string {
  const d = new Date(`${week}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10);
}
