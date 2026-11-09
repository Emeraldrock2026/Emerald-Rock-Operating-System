import { capacityOn, dayFigures, roundHours, type WorkingPattern } from "./capacity";
import type { DateOnly } from "./dates";
import { canReceiveAllocations } from "./planner";
import type { ProjectStatus } from "./projects";

export interface RbAlloc { id: string; employee_id: string; project_id: string; allocation_date: DateOnly; hours: number }
export interface RbEmployee { id: string; active: boolean }
export interface RbProject { id: string; status: ProjectStatus }
/** Move `hours` of an existing allocation to another person and/or day. */
export interface Proposal { allocation_id: string; hours: number; to_employee_id: string; to_date: DateOnly; reason: string }

export interface RbInput {
  allocations: RbAlloc[];
  employees: RbEmployee[];
  projects: RbProject[];
  patterns: Map<string, WorkingPattern[]>;
  days: DateOnly[];
  today: DateOnly;
}

const key = (e: string, d: DateOnly) => `${e}|${d}`;

function totals(allocs: RbAlloc[]) {
  const m = new Map<string, number>();
  for (const a of allocs) m.set(key(a.employee_id, a.allocation_date), roundHours((m.get(key(a.employee_id, a.allocation_date)) ?? 0) + a.hours));
  return m;
}

/** Over-capacity person-days in the week, from today onwards. */
export function overCapacityDays(inp: RbInput) {
  const t = totals(inp.allocations);
  const out: { employee_id: string; date: DateOnly; allocated: number; capacity: number; over: number }[] = [];
  for (const e of inp.employees) for (const d of inp.days) {
    if (d < inp.today) continue;
    const cap = capacityOn(inp.patterns.get(e.id) ?? [], d);
    const f = dayFigures([t.get(key(e.id, d)) ?? 0], cap);
    if (f.overAllocation > 0) out.push({ employee_id: e.id, date: d, allocated: f.allocated, capacity: cap, over: f.overAllocation });
  }
  return out;
}

/**
 * Keeps only proposals that are safe, applied in order: the source must be an
 * over-capacity day from today, the target person active, the target day in the
 * week and from today, the project able to take work, and the target day must
 * not end up over capacity. Each kept proposal must reduce the source overload.
 */
export function validateProposals(inp: RbInput, proposals: Proposal[]): { accepted: Proposal[]; rejected: { proposal: Proposal; why: string }[] } {
  const allocs = inp.allocations.map((a) => ({ ...a }));
  const emp = new Map(inp.employees.map((e) => [e.id, e]));
  const proj = new Map(inp.projects.map((p) => [p.id, p]));
  const cap = (e: string, d: DateOnly) => capacityOn(inp.patterns.get(e) ?? [], d);
  const accepted: Proposal[] = [];
  const rejected: { proposal: Proposal; why: string }[] = [];
  for (const p of proposals) {
    const reject = (why: string) => rejected.push({ proposal: p, why });
    const src = allocs.find((a) => a.id === p.allocation_id);
    if (!src) { reject("Unknown allocation"); continue; }
    const h = roundHours(p.hours);
    if (!(h > 0) || h > src.hours || Math.round(h * 4) !== h * 4) { reject("Invalid hours"); continue; }
    if (p.to_employee_id === src.employee_id && p.to_date === src.allocation_date) { reject("No change"); continue; }
    const t = totals(allocs);
    const srcOver = (t.get(key(src.employee_id, src.allocation_date)) ?? 0) - cap(src.employee_id, src.allocation_date);
    if (src.allocation_date < inp.today || srcOver <= 0) { reject("Source day isn't over capacity"); continue; }
    if (!inp.days.includes(p.to_date) || p.to_date < inp.today) { reject("Target day must be this week, from today"); continue; }
    if (!emp.get(p.to_employee_id)?.active) { reject("Target person isn't active"); continue; }
    const pr = proj.get(src.project_id);
    if (!pr || !canReceiveAllocations(pr.status)) { reject("Project can't take work"); continue; }
    const after = roundHours((t.get(key(p.to_employee_id, p.to_date)) ?? 0) + h);
    if (after > cap(p.to_employee_id, p.to_date)) { reject("Target day would be over capacity"); continue; }
    src.hours = roundHours(src.hours - h);
    allocs.push({ id: `${src.id}:${accepted.length}`, employee_id: p.to_employee_id, project_id: src.project_id, allocation_date: p.to_date, hours: h });
    accepted.push({ ...p, hours: h });
  }
  return { accepted, rejected };
}
