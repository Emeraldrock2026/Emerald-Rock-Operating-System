import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { weekDates, todayIn, isDateOnly } from "@/lib/domain/dates";
import type { WeeklyHours, WorkingPattern } from "@/lib/domain/capacity";
import { overCapacityDays, validateProposals, type Proposal } from "@/lib/domain/rebalance";

export type Suggestion = Proposal & { from_employee_id: string; from_date: string; project_id: string };

export const suggestRebalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; monday: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d.tenantId) || !isDateOnly(d.monday)) throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: mgr }, { data: on }] = await Promise.all([
      sb.rpc("is_tenant_manager", { _tenant: data.tenantId }),
      sb.rpc("module_enabled", { _tenant: data.tenantId, _module: "resource_planning" }),
    ]);
    if (!mgr || !on) throw new Error("NOT_AUTHORISED: only Resource Managers and Owner/Admins can do that");

    const days = weekDates(data.monday);
    const [t, e, w, p, a] = await Promise.all([
      sb.from("tenants").select("timezone").eq("id", data.tenantId).single(),
      sb.from("employees").select("id, full_name, job_title, active").eq("tenant_id", data.tenantId),
      sb.from("working_patterns").select("employee_id, effective_from, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours").eq("tenant_id", data.tenantId),
      sb.from("projects").select("id, reference, name, status").eq("tenant_id", data.tenantId),
      sb.from("allocations").select("id, employee_id, project_id, allocation_date, hours").eq("tenant_id", data.tenantId).gte("allocation_date", days[0]!).lte("allocation_date", days[6]!),
    ]);
    const err = t.error || e.error || w.error || p.error || a.error;
    if (err) throw new Error(err.message);

    const patterns = new Map<string, WorkingPattern[]>();
    for (const r of w.data!) {
      const hours = [r.mon_hours, r.tue_hours, r.wed_hours, r.thu_hours, r.fri_hours, r.sat_hours, r.sun_hours].map(Number) as unknown as WeeklyHours;
      patterns.set(r.employee_id, [...(patterns.get(r.employee_id) ?? []), { effectiveFrom: r.effective_from, hours }]);
    }
    const inp = {
      allocations: a.data!.map((x) => ({ ...x, hours: Number(x.hours) })),
      employees: e.data!, projects: p.data!, patterns, days,
      today: todayIn(t.data!.timezone),
    };
    const over = overCapacityDays(inp);
    if (over.length === 0) return { overDays: 0, suggestions: [] as (Suggestion & { why?: never })[], note: "No one is over their hours from today onwards this week." };

    // Facts sent to the model use short ids only — no emails or commercial data.
    const facts = {
      today: inp.today,
      week: days,
      people: e.data!.map((x) => ({ id: x.id, name: x.full_name, role: x.job_title, active: x.active,
        hours_by_day: Object.fromEntries(days.map((d) => [d, (() => { let c = 0, f = ""; for (const pt of patterns.get(x.id) ?? []) if (pt.effectiveFrom <= d && pt.effectiveFrom >= f) { f = pt.effectiveFrom; c = pt.hours[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7]!; } return c; })()])) })),
      projects: p.data!.map((x) => ({ id: x.id, ref: x.reference, name: x.name, status: x.status })),
      allocations: inp.allocations,
      over_capacity_days: over,
    };

    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    const res = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions:
        "You are a resource planner for a UK consultancy. Propose moves that remove over-allocation. Each move takes some hours (multiples of 0.25) from one existing allocation on an over-capacity day and gives them to another active person (same day preferred, ideally similar role) or to the same person on another day this week, from today onwards. Never push anyone over their hours for that day, never use days with 0 hours, never touch days before today. Only Active or On Hold projects. Prefer few, small moves. Reasons must be one short sentence in British English naming people and days.",
      input: [{ role: "user", content: `Return JSON. Data:\n${JSON.stringify(facts)}` }],
      text: {
        format: {
          type: "json_schema", name: "rebalance", strict: true,
          schema: {
            type: "object", additionalProperties: false, required: ["moves"],
            properties: { moves: { type: "array", items: { type: "object", additionalProperties: false,
              required: ["allocation_id", "hours", "to_employee_id", "to_date", "reason"],
              properties: { allocation_id: { type: "string" }, hours: { type: "number" }, to_employee_id: { type: "string" }, to_date: { type: "string" }, reason: { type: "string" } } } } },
          },
        },
      },
    });
    let text = "";
    for (const item of (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [])
      for (const c of item.content ?? []) if (c.type === "output_text" && c.text) text += c.text;
    let moves: Proposal[] = [];
    try { moves = (JSON.parse(text) as { moves: Proposal[] }).moves ?? []; } catch { moves = []; }

    const { accepted, rejected } = validateProposals(inp, moves);
    const byId = new Map(inp.allocations.map((x) => [x.id, x]));
    const suggestions = accepted.map((m) => { const s = byId.get(m.allocation_id)!; return { ...m, from_employee_id: s.employee_id, from_date: s.allocation_date, project_id: s.project_id }; });
    return {
      overDays: over.length,
      suggestions,
      note: suggestions.length ? (rejected.length ? `${rejected.length} unsafe suggestion(s) were left out.` : "") : "No safe moves found — nobody has spare hours on suitable days. Consider adjusting dates or hours by hand.",
    };
  });
