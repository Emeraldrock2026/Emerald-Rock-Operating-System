import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CalendarClock, ListChecks, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/db-errors";
import { formatDateGB, formatTimestamp, todayIn } from "@/lib/domain/dates";
import { DashboardCharts } from "./dashboard-charts";
import {
  consolidatedActions, moduleKpis, PERIOD_LABEL, periodRange, type DashboardRecord, type DashEvent, type PeriodKind, type Rag,
} from "@/lib/domain/dashboard";

export interface DashModule { id: string; label: string }
interface Props { tenantId: string; projectId: string; timezone: string; modules: DashModule[]; photosActive: boolean; onOpenModule: (id: string) => void; onOpenRecord: (module: string, id: string) => void }

const RAG_CLASS: Record<Rag, string> = {
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  amber: "border-warning/50 bg-warning-surface text-warning-foreground",
  green: "border-success/40 bg-success-surface text-success",
};
const RAG_LABEL: Record<Rag, string> = { red: "Overdue items", amber: "Due soon", green: "On track" };

/** All project records the person may read (RLS applies), open and closed, for period counts. */
function dashboardRecordsQuery(tenantId: string, projectId: string, tz: string) {
  return {
    queryKey: ["tenant", tenantId, "project", projectId, "dashboard-records"],
    queryFn: async (): Promise<DashboardRecord[]> => {
      const { data, error } = await supabase.from("project_records")
        .select("id, reference, title, module_id, status, is_closed, due_date, created_at, updated_at, completed_on")
        .eq("project_id", projectId).limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id, reference: r.reference, title: r.title, module_id: r.module_id, status: r.status, is_closed: r.is_closed,
        due_date: r.due_date, created_on: todayIn(tz, new Date(r.created_at)),
        closed_on: r.is_closed ? (r.completed_on ?? todayIn(tz, new Date(r.updated_at))) : null,
      }));
    },
  };
}

/** Photo uploads and report issues the person may read (RLS applies). */
function dashboardEventsQuery(tenantId: string, projectId: string, tz: string, photos: boolean, reportModules: string[]) {
  return {
    queryKey: ["tenant", tenantId, "project", projectId, "dashboard-events", photos, reportModules.join(",")],
    queryFn: async (): Promise<{ photos: DashEvent[] | null; reports: DashEvent[] | null }> => {
      let ph: DashEvent[] | null = null, rp: DashEvent[] | null = null;
      if (photos) {
        const { data, error } = await supabase.from("project_files").select("id, title, created_at").eq("project_id", projectId).eq("module_id", "photos").limit(5000);
        if (error) throw error;
        ph = (data ?? []).map((f) => ({ id: f.id, on: todayIn(tz, new Date(f.created_at)), module_id: "photos", target_id: f.id, label: f.title }));
      }
      if (reportModules.length) {
        const { data, error } = await supabase.from("report_issues").select("id, record_id, module_id, issue_no, issued_at").eq("project_id", projectId).in("module_id", reportModules).limit(5000);
        if (error) throw error;
        rp = (data ?? []).map((r) => ({ id: r.id, on: todayIn(tz, new Date(r.issued_at)), module_id: r.module_id, target_id: r.record_id, label: `Issue ${r.issue_no}` }));
      }
      return { photos: ph, reports: rp };
    },
  };
}

export function LiveDashboard({ tenantId, projectId, timezone, modules, photosActive, onOpenModule, onOpenRecord }: Props) {
  const today = todayIn(timezone);
  const [kind, setKind] = useState<PeriodKind>("this_week");
  const [custom, setCustom] = useState({ from: today, to: today });
  const period = periodRange(kind, today, custom);
  const q = useQuery(dashboardRecordsQuery(tenantId, projectId, timezone));
  const reportModules = modules.map((m) => m.id).filter((id) => id === "progress_reports" || id === "delay_reports");
  const ev = useQuery(dashboardEventsQuery(tenantId, projectId, timezone, photosActive, reportModules));
  const [actionLimit, setActionLimit] = useState(25);
  const ids = modules.map((m) => m.id);
  const label = (id: string) => modules.find((m) => m.id === id)?.label ?? id;
  const kpis = period && q.data ? moduleKpis(q.data, ids, period, today) : [];
  const actions = q.data ? consolidatedActions(q.data, ids, today) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Reporting period">
          {(Object.keys(PERIOD_LABEL) as PeriodKind[]).map((k) => (
            <Button key={k} size="sm" variant={k === kind ? "default" : "outline"} aria-pressed={k === kind} onClick={() => setKind(k)}>{PERIOD_LABEL[k]}</Button>
          ))}
          {kind === "custom" ? (
            <div className="flex items-center gap-1 text-sm">
              <Input type="date" aria-label="From" className="h-8 w-36" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <span>to</span>
              <Input type="date" aria-label="To" className="h-8 w-36" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{period ? `${formatDateGB(period.from)} – ${formatDateGB(period.to)}` : "Choose both dates"}</span>
          <span aria-live="polite">· Last refreshed {q.dataUpdatedAt ? formatTimestamp(new Date(q.dataUpdatedAt).toISOString(), timezone) : "—"}</span>
          <Button size="sm" variant="ghost" onClick={() => { void q.refetch(); void ev.refetch(); }} disabled={q.isFetching} aria-label="Refresh dashboard">
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
        </div>
      </div>

      {q.error ? <p className="text-sm text-destructive">{friendlyError(q.error)}</p> : null}
      {modules.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No registers or reports are switched on for this project, so there are no figures to show.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <button key={k.module_id} type="button" onClick={() => onOpenModule(k.module_id)}
              className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${label(k.module_id)}: ${k.open} open, ${k.overdue} overdue. Open register`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{label(k.module_id)}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${RAG_CLASS[k.rag]}`}>{RAG_LABEL[k.rag]}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{k.open} <span className="text-sm font-normal text-muted-foreground">open</span></div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>Overdue</dt><dd className="tabular-nums">{k.overdue}</dd></div>
                <div className="flex justify-between"><dt>Due in 7 days</dt><dd className="tabular-nums">{k.dueSoon}</dd></div>
                <div className="flex justify-between"><dt>Raised*</dt><dd className="tabular-nums">{k.raised}</dd></div>
                <div className="flex justify-between"><dt>Closed*</dt><dd className="tabular-nums">{k.closed}</dd></div>
              </dl>
            </button>
          ))}
        </div>
      )}

      {modules.length ? <p className="text-xs text-muted-foreground">* Raised and closed within the chosen period. Open, overdue and due-in-7-days counts are as of today. Cards only count registers switched on for this project that you can open.</p> : null}
      {period && q.data ? <DashboardCharts records={q.data} photos={ev.data?.photos ?? null} reports={ev.data?.reports ?? null} modules={modules} period={period} today={today} onOpenRecord={onOpenRecord} /> : null}
      <section className="rounded-lg border bg-card p-5" aria-label="Outstanding actions">
        <h2 className="mb-3 text-sm font-semibold">Outstanding actions <span className="font-normal text-muted-foreground">({actions.length})</span></h2>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding in the registers you can see.</p>
        ) : (
          <ul className="divide-y text-sm">
            {actions.slice(0, actionLimit).map((a) => (
              <li key={a.id}>
                <button type="button" className="flex w-full items-start gap-2 py-2 text-left hover:bg-muted/50" onClick={() => onOpenRecord(a.module_id, a.id)}>
                  {a.state === "overdue" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                    : a.state === "due_soon" ? <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    : <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{a.reference}</span> {a.title}
                    <span className="block text-xs text-muted-foreground">{label(a.module_id)}{a.due_date ? ` · due ${formatDateGB(a.due_date)}` : " · no due date"}
                      {a.state === "overdue" ? <span className="text-destructive"> · Overdue</span> : a.state === "due_soon" ? <span className="text-warning-foreground"> · Due soon</span> : null}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {actions.length > 25 ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Showing {Math.min(actionLimit, actions.length)} of {actions.length}</span>
            {actionLimit < actions.length ? <Button size="sm" variant="outline" onClick={() => setActionLimit((l) => l + 25)}>Show more</Button> : null}
            {actionLimit < actions.length ? <Button size="sm" variant="ghost" onClick={() => setActionLimit(actions.length)}>Show all</Button> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
